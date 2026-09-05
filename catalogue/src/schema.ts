/**
 * The catalogue's storage, and the only place its shape is written down.
 *
 * Decisions this file exists to serve, from `docs/pipeline-decisions-and-plan.md`:
 *
 *   20  French and English match to the same row, both directions.
 *   24  Hybrid retrieval: full text AND vectors, fused. Two indexes over one table.
 *   26  Three match bands, which need a score, which needs both indexes populated.
 *   27  Neighbours widen in rings and the ring is named, which needs the category
 *       path stored in order rather than flattened to one label.
 *   28  Filter to Canada, keep the rest reachable: `sold_in_canada` is a column,
 *       never a filter applied at load time.
 *   30  A miss is recorded as a gap rather than thrown away.
 *   19/37  Size is identity and unit price needs it, so quantity is parsed into a
 *       number and a unit at load time, not at query time.
 */

import { DatabaseSync } from 'node:sqlite';
import * as sqliteVec from 'sqlite-vec';

/**
 * Dimensions of the stored embedding.
 *
 * Fixed in the schema because a vec0 table's width cannot be altered. Changing
 * embedder means rebuilding this table, which `embed-all.ts` does by dropping it.
 * 384 is the width of the local multilingual model; voyage-4 is asked for the
 * same width via its output_dimension parameter so the two are interchangeable
 * without a schema change.
 */
export const EMBED_DIM = 384;

/**
 * One row per product.
 *
 * `name_en` and `name_fr` are kept apart rather than collapsed into a display
 * string: decision 20 needs a French query to reach an English row, and the only
 * way to do that with a text index is to index both languages as separate
 * columns of the same document.
 */
export interface ProductRow {
  readonly code: string;
  readonly name: string;
  readonly name_en: string | null;
  readonly name_fr: string | null;
  readonly brands: string | null;
  readonly quantity: string | null;
  readonly size_value: number | null;
  readonly size_unit: string | null;
  /** JSON array of OFF category tags, broad to specific. Ring widening reads it in reverse. */
  readonly category_path: string;
  /** Deepest tag. Indexed, because the first neighbour ring is always this one. */
  readonly leaf_category: string | null;
  /** JSON array of allergen tags. Decision 40 prints the difference on an alternative row. */
  readonly allergens: string;
  readonly image_url: string | null;
  readonly sold_in_canada: number;
  readonly source: string;
}

const DDL = `
CREATE TABLE IF NOT EXISTS product (
  code           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  name_en        TEXT,
  name_fr        TEXT,
  brands         TEXT,
  quantity       TEXT,
  size_value     REAL,
  size_unit      TEXT,
  category_path  TEXT NOT NULL DEFAULT '[]',
  leaf_category  TEXT,
  /*
   * 'declared' when the upstream data carried the tags, 'inferred' when they
   * were filled in from nearest labelled neighbours, NULL when there are none.
   *
   * Separated because only 27% of the Canadian rows carry categories, and the
   * other 73% have to get them from somewhere for neighbour rings to work at
   * all. An inferred category is a guess, and a guess presented as a fact is
   * the one thing this product cannot do: the screen that says "here are other
   * oranges" must be able to know whether anyone ever said this was an orange.
   */
  category_source TEXT,
  allergens      TEXT NOT NULL DEFAULT '[]',
  image_url      TEXT,
  sold_in_canada INTEGER NOT NULL DEFAULT 0,
  source         TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS product_leaf ON product(leaf_category);
CREATE INDEX IF NOT EXISTS product_canada ON product(sold_in_canada);

/*
 * Every category a product belongs to, one row each, with how deep the tag sits
 * in that product's own path.
 *
 * The obvious cheaper design is to match rings against leaf_category, and it
 * is silently broken: when the ring widens from "oranges" to "citrus", no
 * product has "citrus" as its LEAF, so the wider ring comes back empty and the
 * widening feature never fires on real data. Membership is a path question, so
 * the path is what gets indexed.
 */
CREATE TABLE IF NOT EXISTS product_category (
  rowid_ref INTEGER NOT NULL,
  tag       TEXT NOT NULL,
  depth     INTEGER NOT NULL,
  PRIMARY KEY (rowid_ref, tag)
) STRICT, WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS product_category_tag ON product_category(tag);

/*
 * External-content FTS: the index reads the product table rather than copying
 * it, so 125k rows are not stored twice and an update cannot desynchronise the
 * two. Unicode61 with diacritic folding, because nobody types the accent in
 * "Céréales" and decision 20 says that must still land on the right row.
 */
CREATE VIRTUAL TABLE IF NOT EXISTS product_fts USING fts5(
  name_en, name_fr, brands, leaf_category,
  content='product',
  content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);

/*
 * A miss is a finding, not a dead end (decision 30). Written by the search path
 * when nothing clears the confident band, and read by whoever fills gaps later.
 * Nothing here is ever promoted into the product table automatically.
 */
CREATE TABLE IF NOT EXISTS catalogue_gap (
  id          INTEGER PRIMARY KEY,
  gtin        TEXT,
  query_text  TEXT,
  observed_at TEXT NOT NULL,
  note        TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS gap_gtin ON catalogue_gap(gtin);
`;

/** Opens the database with the vector extension loaded and the schema applied. */
export function openCatalogue(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { allowExtension: true });
  sqliteVec.load(db);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(DDL);
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS product_vec USING vec0(
       rowid INTEGER PRIMARY KEY,
       embedding float[${EMBED_DIM}]
     )`,
  );
  addMissingColumns(db);
  return db;
}

/**
 * Opens the database for serving: read only, no DDL, no migration.
 *
 * `openCatalogue` is a builder's door. It applies DDL and ALTERs on every open,
 * which is correct while loading and wrong while answering: a serving process
 * that can write can also corrupt, and a serving process that runs a migration
 * on boot will do it at the worst possible moment, which is a restart under
 * load. It also means several serving processes can share one file with the
 * loader still running, because WAL allows one writer and any number of
 * readers, and a reader that never writes can never contend for the lock.
 *
 * The vector extension is still loaded, because a read-only connection still
 * has to be able to run a KNN query.
 */
export function openCatalogueReadOnly(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: true });
  sqliteVec.load(db);
  return db;
}

/**
 * Columns added to the schema after a database was already built.
 *
 * `CREATE TABLE IF NOT EXISTS` silently does nothing to a table that exists, so
 * a column added to the DDL never reaches a catalogue anybody has already
 * loaded. That is not a hypothetical: category_source was added after the
 * Canadian load and the backfill it belongs to failed on the missing column,
 * twenty minutes of embedding later. Cheap, idempotent, and runs on open.
 */
function addMissingColumns(db: DatabaseSync): void {
  const have = new Set(
    (db.prepare('PRAGMA table_info(product)').all() as unknown as { name: string }[])
      .map((r) => r.name),
  );
  const wanted: [string, string][] = [['category_source', 'TEXT']];
  for (const [name, type] of wanted) {
    if (!have.has(name)) db.exec(`ALTER TABLE product ADD COLUMN ${name} ${type}`);
  }
}

/** Rebuilds the full-text index from the product table. Cheap; run after any bulk load. */
export function rebuildFts(db: DatabaseSync): void {
  db.exec(`INSERT INTO product_fts(product_fts) VALUES('rebuild')`);
}

/**
 * Rebuilds the category membership index from the stored paths.
 *
 * Done as a rebuild rather than incrementally on insert, because a product's
 * path can shrink on an upstream refresh and an incremental writer would leave
 * the product a member of a category it has left.
 */
export function rebuildCategories(db: DatabaseSync): void {
  db.exec('DELETE FROM product_category');
  const rows = db
    .prepare('SELECT rowid, category_path FROM product').all() as unknown as { rowid: number; category_path: string }[];
  const insert = db.prepare(
    'INSERT OR IGNORE INTO product_category (rowid_ref, tag, depth) VALUES (?,?,?)',
  );
  db.exec('BEGIN');
  let n = 0;
  for (const r of rows) {
    let path: string[];
    try {
      path = JSON.parse(r.category_path) as string[];
    } catch {
      continue;
    }
    path.forEach((tag, depth) => {
      insert.run(BigInt(r.rowid), tag, depth);
      n += 1;
      if (n % 50000 === 0) {
        db.exec('COMMIT');
        db.exec('BEGIN');
      }
    });
  }
  db.exec('COMMIT');
}

/** Float32 vector to the byte layout sqlite-vec expects. */
export function toVecBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}
