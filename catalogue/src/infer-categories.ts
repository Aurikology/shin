/**
 * Give a category to the three products in four that arrived without one.
 *
 * The problem, measured: 122,158 Canadian products loaded, and only 33,318 of
 * them carry a category tag from upstream. Decision 27 says a miss shows named
 * neighbour rings, and a product with no category has no ring, so without this
 * step the "here are other oranges" screen is unavailable for 73% of the
 * catalogue and nothing would report that it was.
 *
 * HOW, AND WHY NOT THE OBVIOUS WAY. The obvious way is nearest neighbours: for
 * each unlabelled product, ask the vector index for its twelve closest labelled
 * products and take a vote. That was the first version and it does not run. The
 * index is a brute force scan, one query reads all 122,158 vectors, and it costs
 * 240 ms whether or not the results are filtered: six hours for the catalogue,
 * measured rather than estimated. A build step nobody can run is a build step
 * that does not exist.
 *
 * So the labelled rows are collapsed into one direction per category first. Each
 * category becomes the normalised mean of its members, a few thousand of them
 * instead of thirty three thousand rows, and every unlabelled product is
 * compared against those. The same arithmetic, two orders of magnitude less of
 * it, and it runs in minutes.
 *
 * It is also a better question to ask. Twelve nearest neighbours can all be the
 * same oddly named product; a category's centre is what the category is about.
 *
 * THE GUARDS, AND WHERE THEIR NUMBERS COME FROM. A wrong category is worse than
 * no category: a wrong one puts a shampoo in a ring of yoghurts and calls them
 * "other yoghurts", which is a confident lie, while a missing one shows no ring
 * at all. So two guards, and neither number is picked by feel. Run this with
 * --calibrate and it scores both against held out products whose real category
 * is known, and prints how many each setting would have got wrong.
 *
 *   FLOOR   how near the best category's centre has to be.
 *   LEAD    how far ahead of the runner-up it has to be. A product sitting
 *           between two categories gets neither.
 *
 * Everything written here is marked 'inferred'. Nothing downstream is allowed to
 * present an inferred category as a declared one.
 */

import { openCatalogue, rebuildCategories, rebuildFts, EMBED_DIM } from './schema.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';

/*
 * Both set from measurement, and the two measurements disagreed.
 *
 * The held out table this file prints with --calibrate said, on 4,765 labelled
 * Canadian products, 2026-09-04:
 *
 *   lead 0.00   3,972 covered   76.8% right    920 wrong
 *   lead 0.01   2,106 covered   92.1% right    166 wrong
 *   lead 0.02     951 covered   96.0% right     38 wrong
 *   lead 0.03     382 covered   98.4% right      6 wrong
 *   lead 0.05      42 covered  100.0% right      0 wrong
 *
 * The floor is in that table too and it does nothing: 0.80 and 0.90 give the
 * same numbers to within a rounding error, because absolute similarity is high
 * for everything and separates nothing. The search band's own probes reached the
 * same conclusion from a different direction on the same day, which is worth
 * believing. The floor stays as a sanity guard, not as a discriminator.
 *
 * THE HELD OUT TABLE IS AN UPPER BOUND AND NOT A TIGHT ONE, SO IT DID NOT PICK
 * THE SETTING. It is measured on products that upstream did categorise, and this
 * file only ever runs on products that upstream did not: different populations,
 * and the uncategorised ones are uncategorised partly because they are harder.
 * Both its columns turned out optimistic against the real run.
 *
 * So each setting was run for real and 25 of its assignments read by hand:
 *
 *   lead 0.01   18,208 assigned   20 of 25 right   two Clif bars filed as kefir,
 *                                                  ginger biscuits as the spice,
 *                                                  a lentil snack as crisps
 *   lead 0.02    3,432 assigned   25 of 25 right
 *   lead 0.03      803 assigned   too few to matter
 *
 * 0.02 it is. The wrongness is concentrated between 0.01 and 0.02, and 0.03 buys
 * nothing because it assigns almost nothing. This moves the neighbour ring from
 * 26.8% of the catalogue to 29.6%, which is a smaller gain than 0.01's headline
 * and is the one that is actually true. A ring headed "other yoghurts" with a
 * protein bar in it is the exact outcome this file exists to avoid, and a
 * product with no ring simply shows no ring.
 */
const FLOOR = Number(process.env.SHIN_INFER_FLOOR ?? 0.86);
const LEAD = Number(process.env.SHIN_INFER_LEAD ?? 0.02);
/** A category with fewer members than this has a centre made of noise. */
const MIN_MEMBERS = 3;

interface Labelled {
  rowid: number;
  category_path: string;
  embedding: Uint8Array;
}

function toFloats(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, EMBED_DIM);
}

/** Cosine, given both sides are unit length. */
function dot(a: Float32Array, ao: number, b: Float32Array, bo: number): number {
  let s = 0;
  for (let i = 0; i < EMBED_DIM; i += 1) s += a[ao + i] * b[bo + i];
  return s;
}

function normalise(v: Float32Array, off: number): void {
  let sum = 0;
  for (let i = 0; i < EMBED_DIM; i += 1) sum += v[off + i] * v[off + i];
  const n = Math.sqrt(sum) || 1;
  for (let i = 0; i < EMBED_DIM; i += 1) v[off + i] /= n;
}

interface Centroids {
  /** Leaf tag per centroid, in the same order as the packed vectors. */
  readonly tags: string[];
  /** The full path each leaf came from, so an inferred product gets a real path. */
  readonly paths: string[][];
  readonly members: number[];
  /** tags.length * EMBED_DIM floats, each centroid unit length. */
  readonly packed: Float32Array;
}

/**
 * Builds one direction per leaf category from the labelled rows.
 *
 * Held out rows are excluded so the calibration below is not scoring centroids
 * against products that helped build them, which would report a quality the
 * real run does not have.
 */
function buildCentroids(rows: readonly Labelled[], heldOut: ReadonlySet<number>): Centroids {
  const acc = new Map<string, { sum: Float32Array; n: number; path: string[] }>();

  for (const row of rows) {
    if (heldOut.has(row.rowid)) continue;
    let path: string[];
    try {
      path = JSON.parse(row.category_path) as string[];
    } catch {
      continue;
    }
    if (path.length === 0) continue;
    const leaf = path[path.length - 1];

    let entry = acc.get(leaf);
    if (!entry) {
      entry = { sum: new Float32Array(EMBED_DIM), n: 0, path };
      acc.set(leaf, entry);
    }
    const v = toFloats(row.embedding);
    for (let i = 0; i < EMBED_DIM; i += 1) entry.sum[i] += v[i];
    entry.n += 1;
  }

  const tags: string[] = [];
  const paths: string[][] = [];
  const members: number[] = [];
  const keep = [...acc.entries()].filter(([, e]) => e.n >= MIN_MEMBERS);
  const packed = new Float32Array(keep.length * EMBED_DIM);

  keep.forEach(([leaf, e], idx) => {
    tags.push(leaf);
    paths.push(e.path);
    members.push(e.n);
    packed.set(e.sum, idx * EMBED_DIM);
    normalise(packed, idx * EMBED_DIM);
  });

  return { tags, paths, members, packed };
}

/** Best and runner-up category for one vector, plus everything within the lead. */
function classify(c: Centroids, v: Float32Array, lead = 0) {
  let bi = -1;
  let best = -2;
  let second = -2;
  const scores = new Float32Array(c.tags.length);
  for (let i = 0; i < c.tags.length; i += 1) {
    const s = dot(c.packed, i * EMBED_DIM, v, 0);
    scores[i] = s;
    if (s > best) {
      second = best;
      best = s;
      bi = i;
    } else if (s > second) {
      second = s;
    }
  }

  // Everything the evidence cannot separate from the leader. Used below to back
  // off to a shared ancestor rather than throw the row away.
  const tied: number[] = [];
  if (lead > 0) {
    for (let i = 0; i < scores.length; i += 1) {
      if (best - scores[i] < lead) tied.push(i);
    }
  }

  return { index: bi, best, second, tied };
}

/**
 * The deepest category every tied candidate agrees on.
 *
 * WHY THIS EXISTS, AND IT IS HIS EXAMPLE. A product that sits between
 * "en:oranges" and "en:citrus" fails the lead test and gets nothing, which is
 * how the catalogue ended up unable to answer the one case he named: ask it for
 * a kind of orange it does not stock and it had no ring of other oranges to
 * show, because the oranges themselves were the rows that failed this test.
 *
 * But those two categories are not rivals, they are the same answer at two
 * depths. When the tied candidates lie on one path, the shared prefix is not a
 * guess between them; it is exactly what the evidence supports and no more. A
 * ring headed "citrus" is true, useful, and honest about being one level up.
 *
 * When they do not share a prefix, the product really is between two different
 * things and still gets nothing. Returns null in that case.
 */
function sharedAncestor(c: Centroids, tied: readonly number[]): { path: string[]; leaf: string } | null {
  if (tied.length === 0) return null;
  let prefix = c.paths[tied[0]];
  for (const i of tied.slice(1)) {
    const other = c.paths[i];
    let n = 0;
    while (n < prefix.length && n < other.length && prefix[n] === other[n]) n += 1;
    prefix = prefix.slice(0, n);
    if (prefix.length === 0) return null;
  }
  // A single top level tag ("plant based foods") is a ring of forty thousand
  // things, which is not a ring. Two levels is the shallowest that means
  // anything on Open Food Facts' tree.
  if (prefix.length < 2) return null;
  return { path: prefix, leaf: prefix[prefix.length - 1] };
}

function loadLabelled(db: ReturnType<typeof openCatalogue>): Labelled[] {
  return db
    .prepare(
      `SELECT p.rowid AS rowid, p.category_path AS category_path, v.embedding AS embedding
       FROM product p JOIN product_vec v ON v.rowid = p.rowid
       WHERE p.category_path <> '[]'`,
    )
    .all() as unknown as Labelled[];
}

/**
 * What the two guards would have done to products whose real category is known.
 *
 * Three numbers, because they trade against each other: how many got a category
 * at all, how many of those were right, and the count of confident lies each
 * setting would have shipped. The last column is the one that decides.
 */
function calibrate(all: Labelled[]): void {
  const heldOut = new Set<number>();
  for (let i = 0; i < all.length; i += 7) heldOut.add(all[i].rowid);
  const centroids = buildCentroids(all, heldOut);
  const byTag = new Set(centroids.tags);

  const probes = all.filter((r) => heldOut.has(r.rowid));
  console.log(
    `calibrating on ${probes.length} held out products against ${centroids.tags.length} categories\n`,
  );
  console.log('floor  lead   covered  correct  wrong');

  for (const floor of [0.86]) {
    for (const lead of [0.02, 0.03, 0.05, 0.08]) {
      let covered = 0;
      let correct = 0;
      for (const p of probes) {
        let truth: string;
        try {
          const path = JSON.parse(p.category_path) as string[];
          truth = path[path.length - 1];
        } catch {
          continue;
        }
        // Its category did not survive MIN_MEMBERS, so no setting could have
        // got it right and counting it would flatter every row equally.
        if (!byTag.has(truth)) continue;
        const r = classify(centroids, toFloats(p.embedding));
        if (r.index < 0 || r.best < floor || r.best - r.second < lead) continue;
        covered += 1;
        if (centroids.tags[r.index] === truth) correct += 1;
      }
      const pct = covered === 0 ? 0 : (100 * correct) / covered;
      console.log(
        `${floor.toFixed(2)}   ${lead.toFixed(3)}  ${String(covered).padStart(7)}  ` +
        `${pct.toFixed(1).padStart(6)}%  ${String(covered - correct).padStart(5)}`,
      );
    }
  }
}

async function main(): Promise<number> {
  const db = openCatalogue(DB_PATH);

  const vectors = db.prepare('SELECT count(*) AS n FROM product_vec').get() as { n: number };
  if (vectors.n === 0) {
    console.error('no vectors: run embed-all first');
    return 1;
  }

  process.stdout.write('loading labelled vectors...\r');
  const labelled = loadLabelled(db);
  console.log(`labelled   ${labelled.length}                    `);

  if (process.argv.includes('--calibrate')) {
    calibrate(labelled);
    return 0;
  }

  const centroids = buildCentroids(labelled, new Set());
  console.log(`categories ${centroids.tags.length} (at least ${MIN_MEMBERS} members each)`);
  console.log(`guards     floor ${FLOOR}  lead ${LEAD}`);

  const pick = db.prepare(
    `SELECT p.rowid AS rowid, v.embedding AS embedding
     FROM product p JOIN product_vec v ON v.rowid = p.rowid
     WHERE p.category_path = '[]' AND p.rowid > ? ORDER BY p.rowid LIMIT ?`,
  );
  const update = db.prepare(
    `UPDATE product SET category_path = ?, leaf_category = ?, category_source = 'inferred'
     WHERE rowid = ?`,
  );

  const BATCH = 2000;
  // Paged by rowid, not by offset: every pass labels some of the rows the filter
  // selects on, so the set shrinks underneath an OFFSET and rows are skipped
  // silently while the run reports a clean finish.
  let after = 0;
  let seen = 0;
  let assigned = 0;
  let tooFar = 0;
  let backedOff = 0;
  let noLead = 0;
  const started = Date.now();

  for (;;) {
    const rows = pick.all(after, BATCH) as unknown as { rowid: number; embedding: Uint8Array }[];
    if (rows.length === 0) break;

    db.exec('BEGIN');
    for (const row of rows) {
      const r = classify(centroids, toFloats(row.embedding), LEAD);
      if (r.index < 0 || r.best < FLOOR) {
        tooFar += 1;
        continue;
      }

      if (r.best - r.second >= LEAD) {
        update.run(
          JSON.stringify(centroids.paths[r.index]),
          centroids.tags[r.index],
          BigInt(row.rowid),
        );
        assigned += 1;
        continue;
      }

      // Tied. If the tied candidates are the same answer at different depths,
      // take the depth they agree on rather than nothing.
      const up = sharedAncestor(centroids, r.tied);
      if (!up) {
        noLead += 1;
        continue;
      }
      update.run(JSON.stringify(up.path), up.leaf, BigInt(row.rowid));
      backedOff += 1;
    }
    db.exec('COMMIT');

    after = Number(rows[rows.length - 1].rowid);
    seen += rows.length;
    const rate = seen / ((Date.now() - started) / 1000);
    process.stdout.write(`  ${seen}  assigned ${assigned + backedOff}  ${rate.toFixed(0)}/s        \r`);
  }

  process.stdout.write('rebuilding category index...              \r');
  /*
   * BOTH INDEXES, NOT ONE. The UPDATE above rewrites `leaf_category`, which is
   * one of the four columns in `product_fts`, and FTS5 external-content
   * tables do not follow the base table on their own: the index is a separate
   * copy of the terms, and this DDL declares no triggers. `load.ts` rebuilds
   * both after it writes; this script rebuilt only the category index, so the
   * text index kept scoring the pre-backfill leaf terms for the rest of the
   * file's life, and a search for a category word could not reach any row
   * whose category this script had just inferred -- 73% of the Canadian rows.
   * `schema.ts`'s claim that "an update cannot desynchronise the two" was
   * true of neither.
   */
  rebuildFts(db);
  rebuildCategories(db);

  const declared = db
    .prepare(`SELECT count(*) AS n FROM product WHERE category_source IS NULL AND category_path <> '[]'`)
    .get() as { n: number };
  const inferred = db
    .prepare(`SELECT count(*) AS n FROM product WHERE category_source = 'inferred'`)
    .get() as { n: number };
  const stillNone = db
    .prepare(`SELECT count(*) AS n FROM product WHERE category_path = '[]'`)
    .get() as { n: number };
  const members = db
    .prepare('SELECT count(DISTINCT rowid_ref) AS n FROM product_category')
    .get() as { n: number };

  console.log(`\nassigned exactly  ${assigned}`);
  console.log(`  one level up    ${backedOff}`);
  console.log(`  no near centre  ${tooFar}`);
  console.log(`  between two     ${noLead}`);
  console.log(`categories declared ${declared.n}  inferred ${inferred.n}  none ${stillNone.n}`);
  console.log(`products with a ring ${members.n} of ${declared.n + inferred.n + stillNone.n}`);
  return 0;
}

main().then((c) => process.exit(c));
