/**
 * Name-meaning match against Open Food Facts' labelled products (price-category
 * requirement 2.2's first method; research/price-category-methods-2026-10-01/
 * methods-categories-and-placement.md, 2.2 Method A: frozen multilingual sentence
 * embeddings, nearest neighbours over the labelled catalogue).
 *
 *   node src/name-meaning.ts embed --db <COPY of catalogue.db> --vectors <name-index.db>
 *        --model-dir <folder holding Xenova/multilingual-e5-small> [--department food] [--batch 64]
 *
 * WHAT IS EMBEDDED. `nameText`: the brand, the English and French names and the
 * label's generic name. NEVER the category: a labelled item whose vector carried
 * its own category words would pull an unlabelled one toward that label by the
 * label's wording, not the product's. (search.ts's `passageText` includes the leaf
 * category and is for search; this is a different text on purpose.) Both sides are
 * embedded with e5's "query: " prefix, as the model card says for a symmetric task.
 *
 * THE MODEL. multilingual-e5-small (384 dims), read from a folder on disk with
 * remote fetching OFF (`--model-dir`): no download, no network. The vectors live in
 * their own file (`openNameIndex`), keyed 'p:<code>' for a product and
 * 'c:<origin>:<pick id>' for a shopper confirmation's text, each stamped with its
 * model and a hash of its text.
 *
 * LABELLED EXAMPLES. Items placed from their own stored path (placed_by 'path'),
 * plus shopper confirmations whose picked item is placed at a category from its
 * path or by barcode (2.4). Never an item a cascade route placed by text or
 * meaning: the match does not learn from its own guesses.
 *
 * FAILS LOUDLY. A vector that is not finite or not the embedder's width stops the
 * embed. At match time: two models in one index, a labelled example or target
 * item with a name but no vector, or a vector whose text changed since it was made,
 * each stop the match with the count and examples.
 */

import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { embedSymmetric, type Embedder } from './embed.ts';
import { topKSlice, type TopK } from './knn.ts';
import { departmentOfSource } from './placement.ts';
import { sourcesOf } from './placement-cascade.ts';
import { confirmationExamples } from './placement-feedback.ts';

export const NAME_TEXT_RECIPE = 'brands | name_en | name_fr (or name) | generic_name; no category; e5 "query: " both sides; v1';

/* -------------------------------------------------------------- the text */

export function nameText(p: {
  readonly name: string | null;
  readonly name_en?: string | null;
  readonly name_fr?: string | null;
  readonly brands?: string | null;
  readonly generic_name?: string | null;
}): string | null {
  const parts: string[] = [];
  const add = (s: string | null | undefined) => {
    const t = (s ?? '').replace(/\s+/g, ' ').trim();
    if (t && !parts.some((x) => x.toLowerCase() === t.toLowerCase())) parts.push(t);
  };
  add(p.brands);
  const names = [p.name_en, p.name_fr].filter((x) => x && x.trim());
  if (names.length > 0) names.forEach(add);
  else add(p.name);
  add(p.generic_name);
  const brandOnly = parts.length === 1 && (p.brands ?? '').trim() !== '' && names.length === 0 && !(p.name ?? '').trim();
  if (parts.length === 0 || brandOnly) return null;
  return parts.join(' | ').slice(0, 400);
}

/** A stable shard number for a key (FNV-1a). */
export function shardOf(key: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  // Final avalanche (murmur3 fmix32): FNV's low bits alone split product codes unevenly.
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h % count;
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

/* -------------------------------------------------------------- the index */

export function openNameIndex(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS name_vector (
    key        TEXT PRIMARY KEY,
    department TEXT NOT NULL,
    model      TEXT NOT NULL,
    text_sha   TEXT NOT NULL,
    vec        BLOB NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS name_vector_dept ON name_vector(department);`);
  return db;
}

interface Wanted {
  key: string;
  text: string;
}

/** Everything in a department that should have a vector: its products with a name, and confirmations of its items. */
function wanted(catalogue: DatabaseSync, department: string): { items: Wanted[]; noText: number; noTextExamples: string[] } {
  const sources = sourcesOf(department);
  if (sources.length === 0) throw new Error(`name-meaning: department ${department} has no sources`);
  const items: Wanted[] = [];
  let noText = 0;
  const noTextExamples: string[] = [];
  const stmt = catalogue.prepare(
    `SELECT code, name, name_en, name_fr, brands, generic_name FROM product WHERE source IN (${sources.map(() => '?').join(',')}) ORDER BY rowid`,
  );
  for (const r of stmt.iterate(...sources) as Iterable<{ code: string; name: string; name_en: string | null; name_fr: string | null; brands: string | null; generic_name: string | null }>) {
    const t = nameText(r);
    if (t === null) {
      noText += 1;
      if (noTextExamples.length < 5) noTextExamples.push(r.code);
      continue;
    }
    items.push({ key: `p:${r.code}`, text: t });
  }
  const srcOf = catalogue.prepare('SELECT source FROM product WHERE code = ?');
  for (const c of confirmationExamples(catalogue)) {
    const s = srcOf.get(c.code) as { source: string } | undefined;
    if (s && departmentOfSource(s.source) === department) items.push({ key: c.key, text: c.text });
  }
  return { items, noText, noTextExamples };
}

export interface EmbedResult {
  readonly embedded: number;
  readonly kept: number;
  /** Items with nothing to read (no name): no vector, so the meaning route abstains on them. */
  readonly noText: number;
}

/** Embeds every name in the department that has no current vector (by text and model). */
export async function embedNames(
  index: DatabaseSync,
  catalogue: DatabaseSync,
  embedder: Embedder,
  opts: {
    readonly department: string;
    readonly batch?: number;
    readonly log?: (l: string) => void;
    /** Embed only the keys whose hash falls in this shard (several processes, one file each, merged after). */
    readonly shard?: { readonly index: number; readonly count: number };
  },
): Promise<EmbedResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const batch = opts.batch ?? 64;
  const { items, noText, noTextExamples } = wanted(catalogue, opts.department);
  const have = index.prepare('SELECT model, text_sha FROM name_vector WHERE key = ?');
  const shard = opts.shard;
  if (shard && !(Number.isInteger(shard.index) && Number.isInteger(shard.count) && shard.count > 0 && shard.index >= 0 && shard.index < shard.count)) {
    throw new Error(`name-meaning: shard ${JSON.stringify(shard)} is not i/n with 0 <= i < n`);
  }
  const todo = items.filter((w) => {
    if (shard && shardOf(w.key, shard.count) !== shard.index) return false;
    const h = have.get(w.key) as { model: string; text_sha: string } | undefined;
    return !h || h.model !== embedder.id || h.text_sha !== sha(w.text);
  });
  // Similar lengths in one batch: a batch is padded to its longest text, and one long name in 64 short ones costs 64 long ones.
  todo.sort((a, b) => a.text.length - b.text.length || (a.key < b.key ? -1 : 1));
  log(`name-meaning: ${opts.department}: ${items.length} texts, ${todo.length} to embed with ${embedder.id}, ${noText} items with no name (e.g. ${noTextExamples.join(', ')})`);
  const put = index.prepare('INSERT OR REPLACE INTO name_vector (key, department, model, text_sha, vec) VALUES (?,?,?,?,?)');
  const started = Date.now();
  for (let i = 0; i < todo.length; i += batch) {
    const slice = todo.slice(i, i + batch);
    const vecs = await embedSymmetric(embedder, slice.map((w) => w.text));
    if (vecs.length !== slice.length) throw new Error(`name-meaning: asked for ${slice.length} vectors, got ${vecs.length}`);
    index.exec('BEGIN');
    try {
      slice.forEach((w, j) => {
        const v = vecs[j]!;
        if (v.length !== embedder.dim) throw new Error(`name-meaning: vector for ${w.key} has width ${v.length}, the embedder's dim is ${embedder.dim}`);
        for (const x of v) if (!Number.isFinite(x)) throw new Error(`name-meaning: vector for ${w.key} ("${w.text}") is not finite`);
        put.run(w.key, opts.department, embedder.id, sha(w.text), new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      });
      index.exec('COMMIT');
    } catch (err) {
      index.exec('ROLLBACK');
      throw err;
    }
    const done = Math.min(i + batch, todo.length);
    if (done === todo.length || (i / batch) % 50 === 0) {
      const rate = done / Math.max(0.001, (Date.now() - started) / 1000);
      log(`name-meaning: ${opts.department}: ${done}/${todo.length} (${rate.toFixed(0)}/s)`);
    }
  }
  const inShard = shard ? items.filter((w) => shardOf(w.key, shard.count) === shard.index).length : items.length;
  return { embedded: todo.length, kept: inShard - todo.length, noText };
}

/* ---------------------------------------------------------- neighbours */

/** Exact top-k by dot product, in this thread (workers 0) or split across worker threads. */
export async function knnTopK(L: Float32Array, nL: number, Q: Float32Array, nQ: number, dim: number, k: number, opts: { readonly workers?: number } = {}): Promise<TopK> {
  const workers = Math.min(opts.workers ?? 0, nQ);
  if (workers <= 0) return topKSlice(L, nL, Q, 0, nQ, dim, k);
  const sL = new SharedArrayBuffer(L.byteLength);
  new Float32Array(sL).set(L);
  const sQ = new SharedArrayBuffer(Q.byteLength);
  new Float32Array(sQ).set(Q);
  const per = Math.ceil(nQ / workers);
  const url = new URL('./knn-worker.ts', import.meta.url);
  const parts = await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const from = w * per;
      const to = Math.min(nQ, from + per);
      return new Promise<{ from: number; idx: Int32Array; sim: Float32Array }>((res, rej) => {
        if (from >= to) return res({ from, idx: new Int32Array(0), sim: new Float32Array(0) });
        const wk = new Worker(url, { workerData: { L: sL, nL, Q: sQ, from, to, dim, k } });
        wk.once('message', (m: { ok: boolean; idx?: Int32Array; sim?: Float32Array; error?: string }) => {
          if (m.ok) res({ from, idx: m.idx!, sim: m.sim! });
          else rej(new Error(`knn worker ${w}: ${m.error}`));
        });
        wk.once('error', (e) => rej(new Error(`knn worker ${w}: ${e instanceof Error ? e.message : String(e)}`)));
        wk.once('exit', (c) => {
          if (c !== 0) rej(new Error(`knn worker ${w} exited with code ${c}`));
        });
      });
    }),
  );
  const idx = new Int32Array(nQ * k);
  const sim = new Float32Array(nQ * k);
  for (const p of parts) {
    idx.set(p.idx, p.from * k);
    sim.set(p.sim, p.from * k);
  }
  return { idx, sim };
}

export interface MeaningNeighbours {
  /** item code -> labelled neighbour keys, nearest first. */
  readonly neighbours: Map<string, string[]>;
  /** A neighbour key's leaf node, or null when it is not a labelled example. */
  labelOf(key: string): number | null;
  readonly model: string;
  readonly labelled: number;
  readonly targets: number;
  /** Target items with no name: no vector, nothing to match on. */
  readonly noText: number;
}

/**
 * For every item in the department not placed from its own stored path, its k
 * nearest labelled examples by name meaning.
 */
export async function meaningNeighbours(
  index: DatabaseSync,
  catalogue: DatabaseSync,
  opts: { readonly department: string; readonly k?: number; readonly workers?: number; readonly log?: (l: string) => void },
): Promise<MeaningNeighbours> {
  const k = opts.k ?? 10;
  const department = opts.department;
  const models = index.prepare('SELECT DISTINCT model FROM name_vector WHERE department = ?').all(department) as unknown as { model: string }[];
  if (models.length > 1) throw new Error(`name-meaning: ${department} holds vectors from two models (${models.map((m) => m.model).join(', ')}); re-embed with one`);
  const { items } = wanted(catalogue, department);
  const textOf = new Map(items.map((w) => [w.key, w.text]));

  // Labels: path-placed items, and confirmations of items placed at a category by path or barcode.
  const placement = catalogue.prepare(
    `SELECT ip.leaf_id, ip.placed_by, n.kind, n.department FROM item_placement ip JOIN placement_node n ON n.node_id = ip.leaf_id WHERE ip.code = ?`,
  );
  const labelMap = new Map<string, number>();
  const targets: string[] = [];
  for (const w of items) {
    if (w.key.startsWith('p:')) {
      const p = placement.get(w.key.slice(2)) as { leaf_id: number; placed_by: string; kind: string; department: string } | undefined;
      if (!p) throw new Error(`name-meaning: ${w.key} has no placement (is the placement layer built?)`);
      if (p.placed_by === 'path' && p.kind === 'category') labelMap.set(w.key, p.leaf_id);
      else if (p.placed_by !== 'path') targets.push(w.key);
    }
  }
  for (const c of confirmationExamples(catalogue)) {
    if (!textOf.has(c.key)) continue;
    const p = placement.get(c.code) as { leaf_id: number; placed_by: string; kind: string; department: string } | undefined;
    if (p && p.kind === 'category' && (p.placed_by === 'path' || p.placed_by === 'barcode') && p.department === department) labelMap.set(c.key, p.leaf_id);
  }

  const get = index.prepare('SELECT model, text_sha, vec FROM name_vector WHERE key = ?');
  let dim = 0;
  const missing: string[] = [];
  const stale: string[] = [];
  const load = (keys: readonly string[]): Float32Array[] =>
    keys.map((key) => {
      const r = get.get(key) as { model: string; text_sha: string; vec: Uint8Array } | undefined;
      if (!r) {
        missing.push(key);
        return new Float32Array(0);
      }
      if (r.text_sha !== sha(textOf.get(key)!)) stale.push(key);
      const v = new Float32Array(r.vec.buffer.slice(r.vec.byteOffset, r.vec.byteOffset + r.vec.byteLength));
      if (dim === 0) dim = v.length;
      else if (v.length !== dim) throw new Error(`name-meaning: ${key} has width ${v.length}, others ${dim}`);
      return v;
    });
  const labelKeys = [...labelMap.keys()];
  const lv = load(labelKeys);
  const tv = load(targets);
  if (missing.length > 0) {
    throw new Error(`name-meaning: ${missing.length} items in ${department} have a name but no vector (e.g. ${missing.slice(0, 5).join(', ')}): embed first (name-meaning.ts embed)`);
  }
  if (stale.length > 0) {
    throw new Error(`name-meaning: ${stale.length} vectors in ${department} were made from a text that has since changed (e.g. ${stale.slice(0, 5).join(', ')}): re-embed first`);
  }
  const neighbours = new Map<string, string[]>();
  if (labelKeys.length > 0 && targets.length > 0) {
    const L = new Float32Array(labelKeys.length * dim);
    lv.forEach((v, i) => L.set(v, i * dim));
    const Q = new Float32Array(targets.length * dim);
    tv.forEach((v, i) => Q.set(v, i * dim));
    const kk = Math.min(k, labelKeys.length);
    const started = Date.now();
    const r = await knnTopK(L, labelKeys.length, Q, targets.length, dim, kk, { workers: opts.workers ?? 0 });
    opts.log?.(`name-meaning: ${department}: ${targets.length} items against ${labelKeys.length} labelled examples in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    targets.forEach((t, q) => {
      const list: string[] = [];
      for (let j = 0; j < kk; j++) {
        const i = r.idx[q * kk + j]!;
        if (i >= 0) list.push(labelKeys[i]!);
      }
      neighbours.set(t.slice(2), list);
    });
  }
  const totalTargets = (catalogue
    .prepare(`SELECT count(*) AS n FROM product p JOIN item_placement ip ON ip.code = p.code WHERE ip.placed_by <> 'path' AND p.source IN (${sourcesOf(department).map(() => '?').join(',')})`)
    .get(...sourcesOf(department)) as { n: number }).n;
  return {
    neighbours,
    labelOf: (key) => labelMap.get(key) ?? null,
    model: models[0]?.model ?? 'none',
    labelled: labelKeys.length,
    targets: targets.length,
    noText: totalTargets - targets.length,
  };
}

/* -------------------------------------------- the offline e5 embedder */

/**
 * multilingual-e5-small run through onnxruntime-node directly, with the model's own
 * tokenizer, from a folder on disk and never fetched. Same model and pooling (mean
 * over the attention mask, then L2) as embed.ts's LocalEmbedder; measured on this
 * PC about 7 times faster than the transformers.js pipeline for the same batch.
 * onnxruntime-node is the runtime @huggingface/transformers itself installs.
 */
export async function onnxE5Embedder(modelRoot: string, opts: { readonly threads?: number } = {}): Promise<Embedder> {
  const { AutoTokenizer, env } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = modelRoot;
  const tok = await AutoTokenizer.from_pretrained('Xenova/multilingual-e5-small');
  let ort: typeof import('onnxruntime-node');
  try {
    ort = await import('onnxruntime-node');
  } catch (err) {
    throw new Error(`name-meaning: onnxruntime-node is not installed beside @huggingface/transformers (${err instanceof Error ? err.message : String(err)})`);
  }
  const modelFile = join(modelRoot, 'Xenova', 'multilingual-e5-small', 'onnx', 'model.onnx');
  const session = await ort.InferenceSession.create(modelFile, {
    executionProviders: ['cpu'],
    intraOpNumThreads: opts.threads ?? Math.max(1, Math.min(8, cpus().length)),
    graphOptimizationLevel: 'all',
  });
  const DIM = 384;
  const run = async (texts: string[]): Promise<Float32Array[]> => {
    if (texts.length === 0) return [];
    const enc = tok(texts, { padding: true, truncation: true }) as unknown as {
      input_ids: { data: BigInt64Array; dims: number[] };
      attention_mask: { data: BigInt64Array; dims: number[] };
      token_type_ids?: { data: BigInt64Array; dims: number[] };
    };
    const [b, l] = enc.input_ids.dims as [number, number];
    const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {
      input_ids: new ort.Tensor('int64', enc.input_ids.data, [b, l]),
      attention_mask: new ort.Tensor('int64', enc.attention_mask.data, [b, l]),
    };
    if (session.inputNames.includes('token_type_ids')) {
      feeds.token_type_ids = new ort.Tensor('int64', enc.token_type_ids?.data ?? new BigInt64Array(b * l), [b, l]);
    }
    const out = await session.run(feeds);
    const h = out.last_hidden_state;
    if (!h) throw new Error('name-meaning: the model returned no last_hidden_state');
    const data = h.data as Float32Array;
    const d = h.dims[2]!;
    if (d !== DIM) throw new Error(`name-meaning: the model returned ${d} dims, expected ${DIM}`);
    const mask = enc.attention_mask.data;
    const vecs: Float32Array[] = [];
    for (let i = 0; i < b; i++) {
      const v = new Float32Array(d);
      let n = 0;
      for (let t = 0; t < l; t++) {
        if (mask[i * l + t] === 0n) continue;
        n += 1;
        const o = (i * l + t) * d;
        for (let j = 0; j < d; j++) v[j]! += data[o + j]!;
      }
      let norm = 0;
      for (let j = 0; j < d; j++) {
        v[j] = v[j]! / Math.max(1, n);
        norm += v[j]! * v[j]!;
      }
      norm = Math.sqrt(norm) || 1;
      for (let j = 0; j < d; j++) v[j] = v[j]! / norm;
      vecs.push(v);
    }
    return vecs;
  };
  return {
    id: 'local:multilingual-e5-small',
    dim: DIM,
    embedPassages: (texts) => run(texts.map((t) => `passage: ${t}`)),
    embedQuery: async (text) => (await run([`query: ${text}`]))[0]!,
    embedQueries: (texts) => run(texts.map((t) => `query: ${t}`)),
  };
}

/* ------------------------------------------------------------------- CLI */

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: readonly string[]): Promise<number> {
  const dbPath = arg('--db', argv);
  const vectors = arg('--vectors', argv);
  const modelDir = arg('--model-dir', argv);
  if (argv[0] !== 'embed' || !dbPath || !vectors || !modelDir) {
    console.error('name-meaning FAILED: usage: embed --db <catalogue.db> --vectors <name-index.db> --model-dir <dir> [--department food] [--batch 64]');
    return 2;
  }
  const { assertNotLiveCatalogue } = await import('./placement-cascade.ts');
  assertNotLiveCatalogue(dbPath, { live: argv.includes('--live') });
  const catalogue = new DatabaseSync(dbPath, { readOnly: true });
  const index = openNameIndex(vectors);
  try {
    const embedder = await onnxE5Embedder(modelDir, { threads: Number(arg('--threads', argv) ?? 4) });
    const shardArg = arg('--shard', argv);
    const shard = shardArg ? { index: Number(shardArg.split('/')[0]), count: Number(shardArg.split('/')[1]) } : undefined;
    const departments = arg('--department', argv)?.split(',') ?? ['food', 'beauty', 'pet', 'general'];
    for (const department of departments) {
      const r = await embedNames(index, catalogue, embedder, { department, batch: Number(arg('--batch', argv) ?? 64), shard });
      console.log(`name-meaning: ${department}: ${JSON.stringify(r)}`);
    }
    return 0;
  } catch (err) {
    console.error(`name-meaning FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return 1;
  } finally {
    catalogue.close();
    index.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
