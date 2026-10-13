/**
 * A classifier that names categories from their LABELS alone (price-category plan
 * 2.1, "Next"). The cascade's other routes need labelled neighbours: an item whose
 * kind of product has no labelled example near it gets nothing from them. This one
 * needs only the category tree. Each category node's label ("Potato chips") is
 * embedded, the item's name is embedded, and the nearest node in the item's own
 * department is the candidate; below a similarity threshold the route abstains.
 *
 * It sits in the cascade after the name-meaning route and before the Claude slot
 * (placement-cascade.ts CASCADE_ROUTES), and a candidate still goes through the 2.3
 * climb: the top few candidates vote with a softmax weight on their similarity, the
 * climb walks up from the best one until its subtree holds enough of the vote, and
 * the placement records that node's level and that share as its confidence. Two
 * near-equal siblings therefore place at their parent, not at a coin flip.
 *
 * WHAT IS EMBEDDED. The item side is name-meaning.ts `nameText` (brand, names,
 * generic name; never a category), already embedded by `name-meaning.ts embed` as
 * 'p:<code>'. The label side is `labelTextOf`: the taxonomy's English name of the
 * tag, else its French name, else the tag's own words. Label vectors live in the
 * same name-index file as 'l:<department>:<tag>', stamped with the model and a hash
 * of the text, so a changed label or a second model is caught the way a changed
 * item name is. Both sides take e5's "query: " prefix (a symmetric task).
 *
 * THERE IS NO DEFAULT THRESHOLD, ON PURPOSE. Measured 2026-10-13 with
 * placement-sample-eval.ts (multilingual-e5-small, a 55,000-item seeded sample of
 * the real catalogue, 600 hidden-label items per department to tune on): no
 * similarity threshold from 0.70 to 0.98 reached 95% right at category-or-parent in
 * any of the four departments; the best points were 40 to 70% right on 1 to 5% of
 * the items. A threshold bought by wrong answers is not shipped, so the route runs
 * only when a caller passes one (placement-run.ts --label-threshold), as an
 * experiment, and the cascade's other routes are unchanged without it. The
 * threshold is a property of one model: another model needs it measured again.
 *
 * FAILS LOUDLY (RULINGS.md, "Errors never go unnoticed"). A category label with no
 * vector, a vector made from text that has since changed, a vector of the wrong
 * width, or two models in one department each stop the match, naming the first few.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TAXONOMY_PATH, DEPARTMENT_TAXONOMIES } from './category-taxonomy.ts';
import { embedSymmetric, type Embedder } from './embed.ts';
import { knnTopK, sha, wanted } from './name-meaning.ts';
import { sourcesOf, type PlacementRoute, type PlacementTree, type Votes } from './placement-cascade.ts';

export const LABEL_ROUTE_NAME = 'label' as const;
/** Labels offered as candidates per item (the Claude slot's list is at most this long). */
export const LABEL_TOP_K = 8;
/** The candidates that vote in the climb, and how sharply a lower similarity loses weight. */
export const LABEL_VOTERS = 5;
export const LABEL_TEMPERATURE = 0.02;

/* ------------------------------------------------------------- the text */

/** "en:dairy-products" -> "dairy products": the words of a tag, language prefix dropped. */
export function humanizeTag(tag: string): string {
  return tag
    .replace(/^[a-z]{2,3}(?:[-_][a-z0-9]+)?:/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tag (folded) to the label a taxonomy gives it: English name, else French, else any one. Entries with no name are left out. */
export function labelNamesFromObject(obj: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [rawKey, entry] of Object.entries(obj as Record<string, unknown>)) {
    const name = (entry as { name?: unknown } | null)?.name;
    if (!name || typeof name !== 'object') continue;
    const names = name as Record<string, unknown>;
    const pick = [names.en, names.fr, ...Object.values(names)].find((n): n is string => typeof n === 'string' && n.trim() !== '');
    if (pick) out.set(rawKey.trim().toLowerCase(), pick.trim());
  }
  return out;
}

/**
 * The names a department's labels are read from: its own Open Facts taxonomy first
 * (category-taxonomy.ts DEPARTMENT_TAXONOMIES), then the food one for any tag the
 * first does not name. A file that is missing stops the run; a tag in neither is
 * labelled by its own words (labelTextOf).
 */
export function loadLabelNames(department: string, opts: { readonly foodPath?: string; readonly dataDir?: string } = {}): Map<string, string> {
  const dataDir = dirname(opts.foodPath ?? DEFAULT_TAXONOMY_PATH);
  const paths: string[] = [];
  const own = DEPARTMENT_TAXONOMIES[department];
  if (own) paths.push(join(opts.dataDir ?? dataDir, own.file));
  paths.push(opts.foodPath ?? DEFAULT_TAXONOMY_PATH);
  const out = new Map<string, string>();
  for (const p of paths) {
    let obj: unknown;
    try {
      obj = JSON.parse(readFileSync(p, 'utf8'));
    } catch (err) {
      throw new Error(`label-classifier: cannot read the taxonomy ${p} for the ${department} labels (${err instanceof Error ? err.message : String(err)})`);
    }
    for (const [tag, name] of labelNamesFromObject(obj)) if (!out.has(tag)) out.set(tag, name);
  }
  return out;
}

/** The label of a category tag: its taxonomy name when one is known, else the tag's own words. */
export function labelTextOf(tag: string, names: ReadonlyMap<string, string>): string {
  const t = tag.trim().toLowerCase();
  return (names.get(t) ?? humanizeTag(t)).slice(0, 200);
}

function labelKey(department: string, tag: string): string {
  return `l:${department}:${tag}`;
}

/* ---------------------------------------------------------- the vectors */

export interface EmbedLabelsResult {
  readonly embedded: number;
  readonly kept: number;
  readonly labels: number;
}

/** Embeds every category label in the department that has no current vector (by text and model). */
export async function embedLabels(
  index: DatabaseSync,
  tree: PlacementTree,
  embedder: Embedder,
  opts: { readonly department: string; readonly names: ReadonlyMap<string, string>; readonly batch?: number; readonly log?: (l: string) => void },
): Promise<EmbedLabelsResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const batch = opts.batch ?? 64;
  const nodes = tree.categoriesOf(opts.department);
  const have = index.prepare('SELECT model, text_sha FROM name_vector WHERE key = ?');
  const items = nodes.map((n) => ({ key: labelKey(opts.department, n.tag), text: labelTextOf(n.tag, opts.names) }));
  const todo = items.filter((w) => {
    const h = have.get(w.key) as { model: string; text_sha: string } | undefined;
    return !h || h.model !== embedder.id || h.text_sha !== sha(w.text);
  });
  log(`label-classifier: ${opts.department}: ${items.length} category labels, ${todo.length} to embed with ${embedder.id}`);
  const put = index.prepare('INSERT OR REPLACE INTO name_vector (key, department, model, text_sha, vec) VALUES (?,?,?,?,?)');
  for (let i = 0; i < todo.length; i += batch) {
    const slice = todo.slice(i, i + batch);
    const vecs = await embedSymmetric(embedder, slice.map((w) => w.text));
    if (vecs.length !== slice.length) throw new Error(`label-classifier: asked for ${slice.length} vectors, got ${vecs.length}`);
    index.exec('BEGIN');
    try {
      slice.forEach((w, j) => {
        const v = vecs[j]!;
        if (v.length !== embedder.dim) throw new Error(`label-classifier: vector for ${w.key} has width ${v.length}, the embedder's dim is ${embedder.dim}`);
        for (const x of v) if (!Number.isFinite(x)) throw new Error(`label-classifier: vector for ${w.key} ("${w.text}") is not finite`);
        put.run(w.key, opts.department, embedder.id, sha(w.text), new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      });
      index.exec('COMMIT');
    } catch (err) {
      index.exec('ROLLBACK');
      throw err;
    }
  }
  return { embedded: todo.length, kept: items.length - todo.length, labels: items.length };
}

/* ----------------------------------------------------------- candidates */

export interface LabelCandidate {
  readonly nodeId: number;
  /** Cosine similarity of the item's name to the node's label. */
  readonly sim: number;
}

export interface LabelCandidates {
  /** item code -> its nearest labels, nearest first. Items with no name text are absent. */
  readonly candidates: Map<string, LabelCandidate[]>;
  readonly model: string;
  readonly labels: number;
  readonly targets: number;
  /** Target items with no name: no vector, nothing to match on. */
  readonly noText: number;
}

/**
 * For every item in the department not placed from its own stored path, its k
 * nearest category labels by name meaning.
 */
export async function labelCandidates(
  index: DatabaseSync,
  catalogue: DatabaseSync,
  tree: PlacementTree,
  opts: {
    readonly department: string;
    readonly names: ReadonlyMap<string, string>;
    readonly k?: number;
    readonly workers?: number;
    readonly log?: (l: string) => void;
  },
): Promise<LabelCandidates> {
  const k = opts.k ?? LABEL_TOP_K;
  const department = opts.department;
  const models = index.prepare('SELECT DISTINCT model FROM name_vector WHERE department = ?').all(department) as unknown as { model: string }[];
  if (models.length > 1) throw new Error(`label-classifier: ${department} holds vectors from two models (${models.map((m) => m.model).join(', ')}); re-embed with one`);

  const nodes = tree.categoriesOf(department);
  const get = index.prepare('SELECT model, text_sha, vec FROM name_vector WHERE key = ?');
  let dim = 0;
  const missing: string[] = [];
  const stale: string[] = [];
  const read = (key: string, text: string): Float32Array => {
    const r = get.get(key) as { model: string; text_sha: string; vec: Uint8Array } | undefined;
    if (!r) {
      missing.push(key);
      return new Float32Array(0);
    }
    if (r.text_sha !== sha(text)) stale.push(key);
    const v = new Float32Array(r.vec.buffer.slice(r.vec.byteOffset, r.vec.byteOffset + r.vec.byteLength));
    if (dim === 0) dim = v.length;
    else if (v.length !== dim) throw new Error(`label-classifier: ${key} has width ${v.length}, others ${dim}`);
    return v;
  };
  const lv = nodes.map((n) => read(labelKey(department, n.tag), labelTextOf(n.tag, opts.names)));
  const { items } = wanted(catalogue, department);
  const placement = catalogue.prepare('SELECT placed_by FROM item_placement WHERE code = ?');
  const targets: { code: string; vec: Float32Array }[] = [];
  for (const w of items) {
    if (!w.key.startsWith('p:')) continue;
    const code = w.key.slice(2);
    const p = placement.get(code) as { placed_by: string } | undefined;
    if (!p) throw new Error(`label-classifier: ${w.key} has no placement (is the placement layer built?)`);
    if (p.placed_by === 'path') continue;
    targets.push({ code, vec: read(w.key, w.text) });
  }
  if (nodes.length > 0 && missing.some((m) => m.startsWith('l:'))) {
    const ml = missing.filter((m) => m.startsWith('l:'));
    throw new Error(`label-classifier: ${ml.length} category labels in ${department} have no vector (e.g. ${ml.slice(0, 5).map((m) => m.split(':').slice(2).join(':')).join(', ')}): embed the labels first (placement-run.ts --model-dir)`);
  }
  if (missing.length > 0) {
    throw new Error(`label-classifier: ${missing.length} items in ${department} have a name but no vector (e.g. ${missing.slice(0, 5).join(', ')}): embed first (name-meaning.ts embed)`);
  }
  if (stale.length > 0) {
    throw new Error(`label-classifier: ${stale.length} vectors in ${department} were made from a text that has since changed (e.g. ${stale.slice(0, 5).join(', ')}): re-embed first`);
  }
  const candidates = new Map<string, LabelCandidate[]>();
  if (nodes.length > 0 && targets.length > 0) {
    const L = new Float32Array(nodes.length * dim);
    lv.forEach((v, i) => L.set(v, i * dim));
    const Q = new Float32Array(targets.length * dim);
    targets.forEach((t, i) => Q.set(t.vec, i * dim));
    const kk = Math.min(k, nodes.length);
    const started = Date.now();
    const r = await knnTopK(L, nodes.length, Q, targets.length, dim, kk, { workers: opts.workers ?? 0 });
    opts.log?.(`label-classifier: ${department}: ${targets.length} items against ${nodes.length} labels in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    targets.forEach((t, q) => {
      const list: LabelCandidate[] = [];
      for (let j = 0; j < kk; j++) {
        const i = r.idx[q * kk + j]!;
        if (i >= 0) list.push({ nodeId: nodes[i]!.id, sim: r.sim[q * kk + j]! });
      }
      candidates.set(t.code, list);
    });
  }
  const totalTargets = (catalogue
    .prepare(`SELECT count(*) AS n FROM product p JOIN item_placement ip ON ip.code = p.code WHERE ip.placed_by <> 'path' AND p.source IN (${sourcesOf(department).map(() => '?').join(',')})`)
    .get(...sourcesOf(department)) as { n: number }).n;
  return {
    candidates,
    model: models[0]?.model ?? 'none',
    labels: nodes.length,
    targets: targets.length,
    noText: Math.max(0, totalTargets - targets.length),
  };
}

/* ------------------------------------------------------------- the route */

export interface LabelRouteOptions {
  /** The best label's similarity must reach this. Required: there is no validated default (see the module header). */
  readonly threshold: number;
  /** How many of the top candidates vote in the climb; default LABEL_VOTERS. */
  readonly voters?: number;
  /** The softmax temperature on similarity; default LABEL_TEMPERATURE. */
  readonly temperature?: number;
  /** Candidates offered to the Claude slot need at least this similarity (default: any above 0). */
  readonly suggestFloor?: number;
}

/**
 * The cascade route over a candidate table. It votes for the best labels weighted
 * by exp((sim - bestSim) / temperature); the climb (2.3) then decides the level.
 * `suggest` gives the Claude slot the top candidates even when the route itself
 * abstained.
 */
export function labelRoute(table: ReadonlyMap<string, readonly LabelCandidate[]>, opts: LabelRouteOptions): PlacementRoute {
  const threshold = opts.threshold;
  if (!(typeof threshold === 'number' && threshold > 0 && threshold <= 1)) throw new Error(`labelRoute: threshold ${threshold} is not in (0, 1]`);
  const voters = opts.voters ?? LABEL_VOTERS;
  const temperature = opts.temperature ?? LABEL_TEMPERATURE;
  const floor = opts.suggestFloor ?? 0;
  if (!(temperature > 0)) throw new Error(`labelRoute: temperature ${temperature} is not positive`);
  return {
    name: LABEL_ROUTE_NAME,
    prior: 0,
    propose(item) {
      const list = table.get(item.code);
      if (!list || list.length === 0) return null;
      const best = list[0]!.sim;
      if (!Number.isFinite(best)) throw new Error(`label route: similarity ${best} for ${item.code} is not a number`);
      if (best < threshold) return null;
      const votes = new Map<number, number>();
      for (const c of list.slice(0, voters)) {
        if (c.sim < threshold) break;
        votes.set(c.nodeId, Math.exp((c.sim - best) / temperature));
      }
      return votes as Votes;
    },
    suggest(item) {
      const list = table.get(item.code);
      if (!list) return [];
      return list.filter((c) => c.sim > 0 && c.sim >= floor).map((c) => c.nodeId);
    },
  };
}
