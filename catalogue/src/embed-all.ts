/**
 * Fill the vector index for every product that does not have one.
 *
 * Resumable on purpose. Embedding a six-figure catalogue takes long enough that
 * something will interrupt it, and a job that starts from zero every time is a
 * job that never finishes. It selects only products with no vector, so killing
 * it and running it again costs nothing already spent.
 *
 * Switching embedder is a rebuild, not a migration: vectors from two different
 * models in one index return confident nonsense and nothing errors. Pass
 * `--rebuild` when the embedder changes, which is the only safe way to do it.
 */

import { openCatalogue, toVecBlob } from './schema.ts';
import { defaultEmbedder, passageText } from './embed.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const BATCH = Number(process.env.SHIN_EMBED_BATCH ?? 64);
const REBUILD = process.argv.includes('--rebuild');

interface Row {
  rowid: number;
  name: string;
  name_en: string | null;
  name_fr: string | null;
  brands: string | null;
  leaf_category: string | null;
  quantity: string | null;
}

async function main(): Promise<number> {
  const db = openCatalogue(DB_PATH);
  const embedder = defaultEmbedder();
  console.log(`embedder: ${embedder.id} (${embedder.dim} dims)`);

  if (REBUILD) {
    db.exec('DELETE FROM product_vec');
    console.log('vector index cleared for rebuild');
  }

  const pending = db
    .prepare(
      `SELECT count(*) AS n FROM product p
       WHERE NOT EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)`,
    )
    .get() as { n: number };
  console.log(`to embed: ${pending.n}`);
  if (pending.n === 0) return 0;

  /**
   * Pending rows, a page at a time.
   *
   * The page exists because this query is expensive and the model is not. It
   * scans the product table and sorts it, and `product_vec` is a virtual table
   * whose rowids the planner cannot index into, so the NOT EXISTS costs a pass
   * over everything already embedded. Run once per batch of 64 that cost turned
   * a 313 rows/sec embedder into 5 rows/sec at 211k products, which is five
   * hours instead of five minutes, and it gets worse as the catalogue grows.
   * Measured, not reasoned: 704 rows in 150 seconds before this changed.
   *
   * Resumability is unaffected. The page is re-queried when it runs out, so a
   * killed run still restarts from whatever has no vector.
   */
  const select = db.prepare(
    `SELECT p.rowid, p.name, p.name_en, p.name_fr, p.brands, p.leaf_category, p.quantity
     FROM product p
     WHERE NOT EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)
     ORDER BY p.sold_in_canada DESC, p.rowid
     LIMIT ?`,
  );
  const PAGE = Number(process.env.SHIN_EMBED_PAGE ?? 20000);
  const insert = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');

  let done = 0;
  const started = Date.now();
  for (;;) {
    const page = select.all(PAGE) as unknown as Row[];
    if (page.length === 0) break;

    for (let start = 0; start < page.length; start += BATCH) {
      const rows = page.slice(start, start + BATCH);

      const vectors = await embedder.embedPassages(rows.map((r) => passageText(r)));
      db.exec('BEGIN');
      for (let i = 0; i < rows.length; i += 1) {
        insert.run(BigInt(rows[i].rowid), toVecBlob(vectors[i]));
      }
      db.exec('COMMIT');

      done += rows.length;
      if (done % (BATCH * 10) === 0 || done >= pending.n) {
        const rate = done / ((Date.now() - started) / 1000);
        const left = Math.max(0, pending.n - done);
        process.stdout.write(
          `  ${done}/${pending.n}  ${rate.toFixed(0)}/s  eta ${(left / Math.max(rate, 0.01) / 60).toFixed(1)}m   \r`,
        );
      }
    }
  }

  const total = db.prepare('SELECT count(*) AS n FROM product_vec').get() as { n: number };
  const products = db.prepare('SELECT count(*) AS n FROM product').get() as { n: number };
  console.log(`\nvectors ${total.n} / products ${products.n}`);
  return total.n === products.n ? 0 : 1;
}

main().then((code) => process.exit(code));
