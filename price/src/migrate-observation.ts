/**
 * One-time rebuild of the `observation` table to the schema store.ts now
 * declares: `in_stock` loses its `NOT NULL DEFAULT 1` (a default that made
 * silence say a thing was in stock, when Open Prices never observed stock at
 * all), and three store-identity columns are added: `store_name`,
 * `store_city`, `store_osm`.
 *
 * SQLite cannot drop a NOT NULL constraint or add these columns to an
 * existing table in place, so this is the standard SQLite rebuild: build a
 * new table with the new shape, copy every row across, drop the old table,
 * rename the new one into its place, then recreate the indexes that were
 * lost when the old table was dropped.
 *
 * CHECKED 2026-09-05 against price/data/prices.db: no triggers, no views and
 * no foreign keys reference `observation`, so this rebuild cannot silently
 * orphan or cascade anything. `PRAGMA foreign_keys` is not turned off for
 * the rebuild because there is nothing declared against this table for it to
 * affect; the check below re-verifies this at run time rather than trusting
 * that observation on every future run.
 *
 * The whole rebuild runs inside one transaction. If the row count does not
 * come out the same on the other side, it rolls back and exits non-zero
 * rather than leaving a half-built table in place.
 *
 * PAGE_GTIN, 2026-09-08. `store.ts` grew a `page_gtin` column after this
 * script was written, and `openPrices` adds it in place with ALTER TABLE on
 * every database it opens. That means a database can reach this script already
 * carrying `page_gtin` while still missing `store_osm`, and a rebuild whose
 * SELECT did not mention the column would silently drop every barcode an
 * unjoined row was keeping for `rejoin.ts`. The new table always has the
 * column; the copy reads it only when the old table has one to read.
 *
 * Run as: node --experimental-strip-types price/src/migrate-observation.ts
 * Do NOT run this from an agent session. The conductor runs it, because
 * another terminal may have prices.db open.
 */

import { DatabaseSync } from 'node:sqlite';
import { PRICES_DB_PATH } from './store.ts';

interface ColumnInfo {
  readonly name: string;
}

interface CountRow {
  readonly n: number;
}

interface SellerStockRow {
  readonly seller: string;
  readonly in_stock: number | null;
  readonly n: number;
}

function columnNames(db: DatabaseSync): Set<string> {
  const columns = db.prepare('PRAGMA table_info(observation)').all() as unknown as ColumnInfo[];
  return new Set(columns.map((c) => c.name));
}

function alreadyMigrated(db: DatabaseSync): boolean {
  return columnNames(db).has('store_osm');
}

/**
 * Refuses to proceed if anything besides plain rows depends on the shape of
 * `observation`. Stated as CHECKED in the header for 2026-09-05; this is the
 * same check run again, so a schema that has grown a trigger or a view since
 * then is caught rather than assumed away.
 */
function assertRebuildIsSafe(db: DatabaseSync): void {
  const dependents = db
    .prepare(
      `SELECT name, type FROM sqlite_master
        WHERE type IN ('trigger','view') AND tbl_name = 'observation'`,
    )
    .all() as unknown as { name: string; type: string }[];
  if (dependents.length > 0) {
    const names = dependents.map((d) => `${d.type} ${d.name}`).join(', ');
    throw new Error(`observation has dependents this script does not account for: ${names}`);
  }
  const foreignKeys = db.prepare('PRAGMA foreign_key_list(observation)').all() as unknown as unknown[];
  if (foreignKeys.length > 0) {
    throw new Error(`observation has ${foreignKeys.length} foreign key(s) this script does not account for`);
  }
}

function totalRows(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM observation').get() as unknown as CountRow;
  return row.n;
}

function bySellerAndStock(db: DatabaseSync): SellerStockRow[] {
  return db
    .prepare('SELECT seller, in_stock, COUNT(*) AS n FROM observation GROUP BY seller, in_stock ORDER BY seller, in_stock')
    .all() as unknown as SellerStockRow[];
}

function printCounts(label: string, total: number, rows: SellerStockRow[]): void {
  console.log(`\n  ${label} (from the database, not hardcoded)`);
  console.log(`    total rows: ${total}`);
  for (const r of rows) {
    console.log(`    ${r.seller}  in_stock=${r.in_stock === null ? 'NULL' : r.in_stock}  : ${r.n}`);
  }
}

function main(): void {
  const db = new DatabaseSync(PRICES_DB_PATH);
  console.log(`opened ${PRICES_DB_PATH}`);

  if (alreadyMigrated(db)) {
    console.log('observation already has store_osm; already migrated, nothing to do.');
    db.close();
    return;
  }

  assertRebuildIsSafe(db);

  const before = totalRows(db);
  printCounts('before', before, bySellerAndStock(db));

  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE observation_new (
        code            TEXT,
        seller          TEXT NOT NULL,
        seller_sku      TEXT NOT NULL,
        seller_name     TEXT NOT NULL,
        seller_brand    TEXT,
        price_cents     INTEGER NOT NULL,
        kind            TEXT NOT NULL,
        unit_price_cents INTEGER,
        unit_label      TEXT,
        currency        TEXT NOT NULL,
        country         TEXT NOT NULL,
        region          TEXT,
        join_method     TEXT NOT NULL,
        seen_on         TEXT NOT NULL,
        url             TEXT,
        image_url       TEXT,
        in_stock        INTEGER,
        store_name      TEXT,
        store_city      TEXT,
        store_osm       TEXT,
        page_gtin       TEXT,
        PRIMARY KEY (seller, seller_sku, seen_on)
      )
    `);

    /* Present only if openPrices already ALTERed this database. NULL for every
     * row otherwise: nothing in the old data can invent a barcode retroactively,
     * and a rejoin simply has nothing to try for those rows. */
    const pageGtinSource = columnNames(db).has('page_gtin') ? 'page_gtin' : 'NULL';

    /*
     * in_stock is copied verbatim only for seller = 'walmart.ca': those rows
     * are genuine, read from Walmart's own availabilityStatus by crawl.ts.
     * Every other seller's in_stock (all of it, today, openprices) is forced
     * to NULL, because it was written as a literal 1 by code that had no
     * stock signal to observe - the exact bug this rebuild exists to undo.
     * store_name, store_city and store_osm do not exist on the old table, so
     * they come across as NULL for every pre-existing row; nothing in the
     * old data can populate them retroactively.
     */
    db.exec(`
      INSERT INTO observation_new
        (code, seller, seller_sku, seller_name, seller_brand, price_cents, kind,
         unit_price_cents, unit_label, currency, country, region, join_method,
         seen_on, url, image_url, in_stock, store_name, store_city, store_osm,
         page_gtin)
      SELECT
        code, seller, seller_sku, seller_name, seller_brand, price_cents, kind,
        unit_price_cents, unit_label, currency, country, region, join_method,
        seen_on, url, image_url,
        CASE WHEN seller = 'walmart.ca' THEN in_stock ELSE NULL END,
        NULL, NULL, NULL,
        ${pageGtinSource}
      FROM observation
    `);

    const copiedRow = db.prepare('SELECT COUNT(*) AS n FROM observation_new').get() as unknown as CountRow;
    if (copiedRow.n !== before) {
      throw new Error(`row count changed during copy: before ${before}, observation_new ${copiedRow.n}`);
    }

    db.exec('DROP TABLE observation');
    db.exec('ALTER TABLE observation_new RENAME TO observation');

    db.exec('CREATE INDEX IF NOT EXISTS observation_by_code ON observation(code, seen_on)');
    db.exec("CREATE INDEX IF NOT EXISTS observation_unjoined ON observation(join_method) WHERE code IS NULL");
    db.exec(
      'CREATE INDEX IF NOT EXISTS observation_rejoinable ON observation(page_gtin) WHERE code IS NULL AND page_gtin IS NOT NULL',
    );

    const after = totalRows(db);
    if (after !== before) {
      throw new Error(`row count changed after rename: before ${before}, after ${after}`);
    }

    db.exec('COMMIT');
    printCounts('after', after, bySellerAndStock(db));
    console.log(`\n  row count unchanged: ${before} -> ${after}`);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error(`migration failed and was rolled back: ${String(e)}`);
    db.close();
    process.exit(1);
  }

  db.close();
}

if (import.meta.filename === process.argv[1]) {
  main();
}
