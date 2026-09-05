/**
 * Rebuild the category membership index, as a command you can run.
 *
 * `rebuildCategories` in schema.ts is called by the loader at the end of a bulk
 * load, which is the only way it had ever been run. That is fine until the
 * rebuild is needed on its own, without reloading five million products behind
 * it, which is exactly what folding tag case to lower needed. Reloading the
 * catalogue to re-derive an index that is already derivable from the stored
 * paths is hours of work to avoid two minutes of it.
 *
 * WHAT THIS DOES TO A LIVE SERVER, because it is not free and the runbook has
 * to say so:
 *
 *   `rebuildCategories` deletes every row in product_category before writing
 *   the new ones. For the length of the run the neighbour ring finds no
 *   members for any tag, so a search that would have offered "we do not have
 *   that one, here are the other oranges" offers nothing instead. It does not
 *   error and it does not look broken; it looks like a catalogue with no
 *   neighbours. Barcode lookups and text search are untouched, because neither
 *   reads this table.
 *
 *   The search workers memoize category sizes per tag for the life of the
 *   process and never invalidate them, so they must be restarted afterwards.
 *   A worker that ran through a rebuild holds counts for tags that no longer
 *   exist under that spelling, and it will hold them until it is killed.
 *
 * So: announce it, run it, restart the workers. Measured on this catalogue at
 * 5,182,591 products and 17.2 million membership rows, the whole thing is
 * about two minutes.
 */

import { DatabaseSync } from 'node:sqlite';
import { rebuildCategories } from './schema.ts';

const DB_PATH = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';

function count(db: DatabaseSync, sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

function main(): void {
  const db = new DatabaseSync(DB_PATH);
  console.log(`opened ${DB_PATH}`);

  const before = count(db, 'SELECT count(*) AS n FROM product_category');
  const distinctBefore = count(db, 'SELECT count(DISTINCT tag) AS n FROM product_category');
  const products = count(db, 'SELECT count(*) AS n FROM product');
  console.log(`  before: ${before} membership rows, ${distinctBefore} distinct tags, over ${products} products`);

  const startedAt = new Date().toISOString();
  console.log(`  started ${startedAt}`);
  const t0 = performance.now();
  rebuildCategories(db);
  const seconds = (performance.now() - t0) / 1000;
  const endedAt = new Date().toISOString();

  const after = count(db, 'SELECT count(*) AS n FROM product_category');
  const distinctAfter = count(db, 'SELECT count(DISTINCT tag) AS n FROM product_category');
  const stillMixed = count(
    db,
    'SELECT count(*) AS n FROM product_category WHERE tag <> lower(tag)',
  );

  console.log(`  ended   ${endedAt}  (${seconds.toFixed(1)} s)`);
  console.log(`  after : ${after} membership rows, ${distinctAfter} distinct tags`);
  console.log(`  rows collapsed by folding case: ${before - after}`);
  console.log(`  tags collapsed by folding case: ${distinctBefore - distinctAfter}`);

  /*
   * The check that the fold actually happened, asked of the table rather than
   * of the code that wrote it. A rebuild that silently kept its old casing
   * would leave this non-zero and every reader would still be splitting
   * membership across spellings while the log claimed success.
   */
  if (stillMixed !== 0) {
    console.error(`  FAILED: ${stillMixed} rows still carry a non-lower-case tag`);
    process.exitCode = 1;
    return;
  }
  console.log('  every stored tag is lower-case: verified against the table');
  console.log('\n  RESTART THE SEARCH WORKERS NOW. They memoize category sizes and never invalidate.');
}

main();
