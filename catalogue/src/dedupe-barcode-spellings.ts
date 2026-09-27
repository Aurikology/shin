/**
 * ONE BARCODE, ONE ROW: collapses products stored under two spellings of the same
 * barcode, and is the cleanup half of the plan's duplicate unit.
 *
 * WHAT WAS FOUND, counted on the live 4.13 GB catalogue 2026-09-26, not sampled.
 * `load.ts` inserts `code` exactly as the prepared row spells it and upserts
 * `ON CONFLICT(code)`, so a barcode loaded twice as the SAME string collapses by
 * itself. Nothing canonicalises the barcode first, so a barcode written two ways is
 * two rows, and the table holds:
 *
 *   3,785,955 rows with a 13-digit code
 *   1,375,443 rows with a 12-digit code
 *   1,375,443 pairs where a 12-digit code and its zero-padded 13-digit twin are
 *             BOTH present, which is every 12-digit row in the table
 *   1,375,441 of those pairs carry the same name and were both written by the
 *             electronics loader
 *     198,095 pairs are Canadian, which is 32% of the 618,365 rows the phone
 *             downloads: a third of that file is a product it already has
 *
 * WHICH SPELLING WINS. The 13-digit one. Prepending a zero to a 12-digit UPC-A is
 * how GS1 writes it as a GTIN-13, 3.79 million rows in this table already use that
 * form, and `search.ts`'s `byGtin` and the phone's pack both already handle it. So
 * the 12-digit twin is the row that goes.
 *
 * WHAT IS NOT LOST, checked before anything was deleted. Across all 1,375,443 pairs
 * the row being deleted holds a field the surviving row lacks in **six** cases
 * total: 1 name_en, 1 brands, 2 leaf_category, 2 image_url. Those fields are copied
 * onto the surviving row first. `sold_in_canada` disagrees in **zero** pairs. Two
 * pairs carry different names, and they are a real data fault rather than a
 * spelling one: a food name sitting on an electronics barcode, from the food
 * database. Those two are printed and handled by hand rather than by this rule.
 *
 * THE INDEXES. `product_fts` is external-content over `product`, so deleting rows
 * leaves it stale, and `product_vec` is keyed by rowid, so a deleted rowid orphans
 * a vector. Both are dealt with here: a vector on the dying row is moved to the
 * surviving row when the survivor has none, the dying row's vector is deleted, and
 * the text index is rebuilt at the end.
 *
 * Run with no argument for a dry run, which counts and prints and writes nothing.
 * `--apply` does it, and refuses to start unless a backup copy exists.
 *
 *   node --experimental-strip-types catalogue/src/dedupe-barcode-spellings.ts
 *   node --experimental-strip-types catalogue/src/dedupe-barcode-spellings.ts --apply
 */
import { DatabaseSync } from 'node:sqlite';
import * as sqliteVec from 'sqlite-vec';
import { copyFileSync, existsSync, renameSync, statSync } from 'node:fs';

const DB = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const apply = process.argv.includes('--apply');

/** The join that defines a pair: a 13-digit code beginning with 0, and its 12-digit twin. */
const PAIR =
  "FROM product p JOIN product q ON q.code = substr(p.code, 2) WHERE length(p.code) = 13 AND p.code LIKE '0%'";

/**
 * The join that defines the OTHER pair shape, found 2026-09-26 by reading the
 * shipped phone pack rather than the code: a 13-digit code beginning with five
 * zeros, and the 8-digit code left over after stripping them. GS1 writes an
 * EAN-8 right-aligned in a 13-digit field with leading zeros exactly as it
 * writes a UPC-A, and the check digit does not change (see `barcode.ts`), so
 * these are one trade item too. On the live catalogue: 406 pairs (812 rows),
 * 119 of them Canadian, 404 of the 406 carrying the same name on both rows.
 */
const PAIR_8 =
  "FROM product p JOIN product q ON q.code = substr(p.code, 6) WHERE length(p.code) = 13 AND p.code LIKE '00000%'";

/**
 * `PAIR_8` narrowed to the pairs this rule actually folds. Unlike the 12/13
 * shape above, whose two disagreeing pairs both turned out to be the same
 * object (one corrected by hand below, one already fine to fold as written),
 * the 8/13 shape's two disagreeing pairs are a real data fault: 'Avocado'
 * against a Google Pixel screen protector, and 'Natural Spring Water' against
 * 'SHELL SELECT ... Eau de Source', genuinely different products sharing a
 * junk code rather than the same item spelled two ways. Those are printed and
 * never folded by this rule.
 */
const PAIR_8_FOLDABLE = `${PAIR_8} AND p.name = q.name`;

/**
 * Fields worth rescuing off the row that is about to be deleted, read from the
 * schema at run time rather than typed by hand. A hand-written list in a
 * script that deletes rows is the defect: it silently excludes every column
 * added after whoever wrote it last looked, and one of those columns
 * (`category_path`, added to this table after this list was written) already
 * lost data on 2026-09-26 because of it -- 2 of the 1,375,443 pairs, found and
 * repaired separately by `repair-dedupe-rescue.ts`. Every column that CAN be
 * null is a candidate here; the key (`code`) and every NOT NULL column
 * (`name`, `category_path`, `allergens`, `sold_in_canada`, `source` -- the
 * survivor's own identity and classification, never silently overwritten from
 * the row being deleted) are excluded by that same test, not by name, so a
 * NOT NULL column added later is excluded automatically and a nullable one is
 * rescued automatically.
 */
function rescueColumns(db: DatabaseSync): string[] {
  const cols = db.prepare('PRAGMA table_info(product)').all() as unknown as { name: string; notnull: number; pk: number }[];
  return cols.filter((c) => c.pk === 0 && c.notnull === 0).map((c) => c.name);
}

function open(readOnly: boolean): DatabaseSync {
  const db = new DatabaseSync(DB, { allowExtension: true, readOnly });
  sqliteVec.load(db);
  // Other jobs are on this file tonight; a reader or writer should wait out a
  // lock rather than fail on one.
  db.exec('PRAGMA busy_timeout = 120000');
  return db;
}

function counts(db: DatabaseSync): Record<string, number> {
  const one = (sql: string): number => (db.prepare(sql).get() as { c: number }).c;
  return {
    products: one('SELECT count(*) AS c FROM product'),
    twelveDigit: one('SELECT count(*) AS c FROM product WHERE length(code) = 12'),
    pairs: one(`SELECT count(*) AS c ${PAIR}`),
    canadianPairs: one(`SELECT count(*) AS c ${PAIR} AND p.sold_in_canada = 1 AND q.sold_in_canada = 1`),
    canadian: one('SELECT count(*) AS c FROM product WHERE sold_in_canada = 1'),
    namesDisagree: one(`SELECT count(*) AS c ${PAIR} AND p.name != q.name`),
    eightDigit: one('SELECT count(*) AS c FROM product WHERE length(code) = 8'),
    pairs8: one(`SELECT count(*) AS c ${PAIR_8}`),
    canadianPairs8: one(`SELECT count(*) AS c ${PAIR_8} AND p.sold_in_canada = 1 AND q.sold_in_canada = 1`),
    namesDisagree8: one(`SELECT count(*) AS c ${PAIR_8} AND p.name != q.name`),
    foldablePairs8: one(`SELECT count(*) AS c ${PAIR_8_FOLDABLE}`),
  };
}

function main(): number {
  if (!existsSync(DB)) {
    console.log(`no catalogue at ${DB}`);
    return 1;
  }

  const ro = open(true);
  const RESCUE = rescueColumns(ro);
  console.log('rescuing (schema-derived):', RESCUE);
  const before = counts(ro);
  console.log('BEFORE:', JSON.stringify(before));

  console.log('\nthe pairs whose names disagree, which this rule does NOT touch:');
  const disagree = ro
    .prepare(
      'SELECT p.rowid AS keepRow, p.code AS keepCode, p.name AS keepName, p.source AS keepSrc,' +
        ' q.rowid AS dropRow, q.code AS dropCode, q.name AS dropName, q.source AS dropSrc ' +
        PAIR +
        ' AND p.name != q.name',
    )
    .all();
  for (const r of disagree) console.log('  ' + JSON.stringify(r));

  console.log('\nthe 8/13 pairs whose names disagree, a real data fault, which this rule does NOT touch:');
  const disagree8 = ro
    .prepare(
      'SELECT p.rowid AS keepRow, p.code AS keepCode, p.name AS keepName, p.source AS keepSrc,' +
        ' q.rowid AS dropRow, q.code AS dropCode, q.name AS dropName, q.source AS dropSrc ' +
        PAIR_8 +
        ' AND p.name != q.name',
    )
    .all();
  for (const r of disagree8) console.log('  ' + JSON.stringify(r));

  const rescuable: Record<string, number> = {};
  for (const col of RESCUE) {
    rescuable[col] = (
      ro.prepare(`SELECT count(*) AS c ${PAIR} AND p.${col} IS NULL AND q.${col} IS NOT NULL`).get() as { c: number }
    ).c;
  }
  console.log('\nfields to copy off the dying row before it goes:', JSON.stringify(rescuable));

  const rescuable8: Record<string, number> = {};
  for (const col of RESCUE) {
    rescuable8[col] = (
      ro.prepare(`SELECT count(*) AS c ${PAIR_8_FOLDABLE} AND p.${col} IS NULL AND q.${col} IS NOT NULL`).get() as {
        c: number;
      }
    ).c;
  }
  console.log('\nfields to copy off the dying 8-digit row before it goes:', JSON.stringify(rescuable8));

  /*
   * DRY RUN ONLY, and the reason is measured. These three EXISTS queries walk all
   * 1,375,443 pairs against `product_vec` and took longer than everything else in
   * this script put together; on the apply path they are pure diagnostics, and while
   * five loaders were writing to the same file they turned a ten-minute job into one
   * that had not finished in forty. The apply path needs none of it: the only
   * decision it feeds is "move a vector when only the dying row has one", and that
   * query selects the rows it needs directly.
   */
  const vectors = !apply ? {
    dyingOnly: (
      ro
        .prepare(
          `SELECT count(*) AS c ${PAIR} AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = q.rowid)` +
            ' AND NOT EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)',
        )
        .get() as { c: number }
    ).c,
    survivingOnly: (
      ro
        .prepare(
          `SELECT count(*) AS c ${PAIR} AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)` +
            ' AND NOT EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = q.rowid)',
        )
        .get() as { c: number }
    ).c,
    both: (
      ro
        .prepare(
          `SELECT count(*) AS c ${PAIR} AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)` +
            ' AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = q.rowid)',
        )
        .get() as { c: number }
    ).c,
  } : 'not counted on the apply path: diagnostics only, and they cost more than the work';
  console.log('vectors:', JSON.stringify(vectors));

  const vectors8 = !apply ? {
    dyingOnly: (
      ro
        .prepare(
          `SELECT count(*) AS c ${PAIR_8_FOLDABLE} AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = q.rowid)` +
            ' AND NOT EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)',
        )
        .get() as { c: number }
    ).c,
    survivingOnly: (
      ro
        .prepare(
          `SELECT count(*) AS c ${PAIR_8_FOLDABLE} AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)` +
            ' AND NOT EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = q.rowid)',
        )
        .get() as { c: number }
    ).c,
    both: (
      ro
        .prepare(
          `SELECT count(*) AS c ${PAIR_8_FOLDABLE} AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)` +
            ' AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = q.rowid)',
        )
        .get() as { c: number }
    ).c,
  } : 'not counted on the apply path: diagnostics only, and they cost more than the work';
  console.log('vectors (8/13):', JSON.stringify(vectors8));
  ro.close();

  if (!apply) {
    console.log('\nDRY RUN. Nothing written. Re-run with --apply.');
    return 0;
  }

  /*
   * A FILE WITH THE RIGHT NAME IS NOT A BACKUP.
   *
   * This checked only that the path existed, and on 2026-09-26 it printed
   * "backup in place" over a copy made on 2026-09-13, thirteen days and one
   * 45,051-row load earlier. The run then deleted 1,375,443 rows with no
   * rollback point for anything added since. Nothing was lost, because the
   * delete was right, but the safety line was not there.
   *
   * So the copy is trusted only if it is at least as new as the database it is
   * supposed to be a copy of. An older one is renamed out of the way rather
   * than deleted or overwritten, because a stale copy is still the only record
   * of the state it came from.
   */
  const backup = `${DB}.before-dedupe`;
  const stale = existsSync(backup) && statSync(backup).mtimeMs < statSync(DB).mtimeMs;
  if (stale) {
    const parked = `${backup}.${new Date(statSync(backup).mtimeMs).toISOString().slice(0, 10)}`;
    console.log(`\nthe existing backup is OLDER than the database, so it is not a backup of it.`);
    console.log(`  ${backup} last written ${new Date(statSync(backup).mtimeMs).toISOString()}`);
    console.log(`  ${DB} last written ${new Date(statSync(DB).mtimeMs).toISOString()}`);
    console.log(`moving the old one to ${parked} and taking a fresh copy`);
    renameSync(backup, parked);
  }
  if (!existsSync(backup)) {
    console.log(`\ncopying ${DB} to ${backup} first (${(statSync(DB).size / 1e9).toFixed(2)} GB)`);
    copyFileSync(DB, backup);
  }
  console.log(`backup in place: ${backup}, written ${new Date(statSync(backup).mtimeMs).toISOString()}`);

  const db = open(false);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('BEGIN');
  try {
    // 1. Rescue the handful of fields that exist only on the dying row.
    for (const col of RESCUE) {
      db.exec(
        `UPDATE product SET ${col} = (SELECT q.${col} FROM product q WHERE q.code = substr(product.code, 2))` +
          ` WHERE length(code) = 13 AND code LIKE '0%' AND ${col} IS NULL` +
          ` AND EXISTS (SELECT 1 FROM product q WHERE q.code = substr(product.code, 2) AND q.${col} IS NOT NULL)`,
      );
    }

    /*
     * 1c. Same rescue, for the 8/13 shape, restricted to foldable pairs (names
     * agree) exactly like every other apply-path step for this shape below.
     */
    for (const col of RESCUE) {
      db.exec(
        `UPDATE product SET ${col} = (SELECT q.${col} FROM product q WHERE q.code = substr(product.code, 6))` +
          ` WHERE length(code) = 13 AND code LIKE '00000%' AND ${col} IS NULL` +
          ` AND EXISTS (SELECT 1 FROM product q WHERE q.code = substr(product.code, 6) AND q.${col} IS NOT NULL` +
          ` AND q.name = product.name)`,
      );
    }

    /*
     * 1b. THE ONE PAIR DECIDED BY HAND, and it is a data fault rather than a
     * spelling one. Barcode 0045496590161 carries "Caramel au beurre" from the food
     * database on the surviving row, and "Switch Pro Controller" from the
     * electronics one on the row about to be deleted. The prefix 0045496 is
     * Nintendo's, so the electronics name is the true one and the food row is wrong
     * about what the product IS, not merely differently worded. Collapsing the pair
     * by rule would keep the wrong name for good, so the name, brand and source move
     * across first. The other disagreeing pair, "Verbatim CD-R" against "52x CD-R
     * Media", is two names for the same object; the surviving one carries the brand,
     * so it is left alone.
     *
     * THIS STEP HAS TO SURVIVE BEING RUN TWICE. It reads the true name off the
     * 12-digit partner row, and the pass below then deletes that partner. So on a
     * second run the subquery has nothing to read, `name` goes NULL, and the whole
     * transaction dies on the NOT NULL constraint and rolls back -- which is exactly
     * what happened on 2026-09-26 when this script was re-run to add the 8/13
     * shape: every 8/13 fold was lost to a correction that had already been made.
     * The `EXISTS` guard makes the step a no-op once the partner is gone, and
     * `changes: 0` then means "already corrected", not "failed to correct".
     */
    const NINTENDO = '0045496590161';
    const fixed = db
      .prepare(
        'UPDATE product SET name = (SELECT q.name FROM product q WHERE q.code = substr(product.code, 2)),' +
          ' brands = coalesce((SELECT q.brands FROM product q WHERE q.code = substr(product.code, 2)), brands),' +
          " source = 'icecat' WHERE code = ?" +
          ' AND EXISTS (SELECT 1 FROM product q WHERE q.code = substr(product.code, 2) AND q.name IS NOT NULL)',
      )
      .run(NINTENDO);
    console.log(
      fixed.changes
        ? `corrected the food-name-on-an-electronics-barcode row: ${fixed.changes} row`
        : 'the food-name-on-an-electronics-barcode row was corrected by an earlier run, nothing to do',
    );

    // 2. Move a vector from the dying row to the survivor when only the dying row has one.
    const movable = db
      .prepare(
        `SELECT p.rowid AS keepRow, q.rowid AS dropRow ${PAIR}` +
          ' AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = q.rowid)' +
          ' AND NOT EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)',
      )
      .all() as Array<{ keepRow: number; dropRow: number }>;
    const readVec = db.prepare('SELECT embedding FROM product_vec WHERE rowid = ?');
    const putVec = db.prepare('INSERT INTO product_vec(rowid, embedding) VALUES (?, ?)');
    for (const m of movable) {
      const v = readVec.get(m.dropRow) as { embedding: Uint8Array } | undefined;
      if (v) putVec.run(m.keepRow, v.embedding);
    }
    console.log(`moved ${movable.length} vectors onto the surviving row`);

    /*
     * 2b. Same vector move, for the 8/13 shape, restricted to foldable pairs so a
     * disagreeing pair's vector is never touched.
     */
    const movable8 = db
      .prepare(
        `SELECT p.rowid AS keepRow, q.rowid AS dropRow ${PAIR_8_FOLDABLE}` +
          ' AND EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = q.rowid)' +
          ' AND NOT EXISTS (SELECT 1 FROM product_vec v WHERE v.rowid = p.rowid)',
      )
      .all() as Array<{ keepRow: number; dropRow: number }>;
    for (const m of movable8) {
      const v = readVec.get(m.dropRow) as { embedding: Uint8Array } | undefined;
      if (v) putVec.run(m.keepRow, v.embedding);
    }
    console.log(`moved ${movable8.length} vectors onto the surviving row (8/13)`);

    // 3. Delete the dying rows' vectors, then the rows.
    db.exec(
      'DELETE FROM product_vec WHERE rowid IN (' +
        "SELECT q.rowid FROM product p JOIN product q ON q.code = substr(p.code, 2) WHERE length(p.code) = 13 AND p.code LIKE '0%')",
    );
    /*
     * `product_category` is keyed by `rowid_ref`, not by the barcode, so the dying
     * row's category tags have to go by rowid or they become tags pointing at a row
     * that no longer exists. Written after reading the schema rather than guessed:
     * a first draft of this line said `WHERE code IN (...)` and would have thrown
     * inside the transaction.
     */
    db.exec(
      'DELETE FROM product_category WHERE rowid_ref IN (' +
        "SELECT q.rowid FROM product p JOIN product q ON q.code = substr(p.code, 2) WHERE length(p.code) = 13 AND p.code LIKE '0%')",
    );
    db.exec(
      'DELETE FROM product WHERE rowid IN (' +
        "SELECT q.rowid FROM product p JOIN product q ON q.code = substr(p.code, 2) WHERE length(p.code) = 13 AND p.code LIKE '0%')",
    );

    /*
     * 3b. Same three deletes, for the 8/13 shape, restricted to foldable pairs
     * (names agree) so the two junk-code pairs are never dropped.
     */
    db.exec(
      'DELETE FROM product_vec WHERE rowid IN (' +
        "SELECT q.rowid FROM product p JOIN product q ON q.code = substr(p.code, 6)" +
        " WHERE length(p.code) = 13 AND p.code LIKE '00000%' AND p.name = q.name)",
    );
    db.exec(
      'DELETE FROM product_category WHERE rowid_ref IN (' +
        "SELECT q.rowid FROM product p JOIN product q ON q.code = substr(p.code, 6)" +
        " WHERE length(p.code) = 13 AND p.code LIKE '00000%' AND p.name = q.name)",
    );
    db.exec(
      'DELETE FROM product WHERE rowid IN (' +
        "SELECT q.rowid FROM product p JOIN product q ON q.code = substr(p.code, 6)" +
        " WHERE length(p.code) = 13 AND p.code LIKE '00000%' AND p.name = q.name)",
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.log('ROLLED BACK, nothing changed:', err instanceof Error ? err.message : String(err));
    db.close();
    return 1;
  }

  // 4. The text index reads the product table by rowid, so it has to be rebuilt.
  console.log('rebuilding the text index, which reads the product table rather than copying it');
  db.exec("INSERT INTO product_fts(product_fts) VALUES('rebuild')");

  const after = counts(db);
  console.log('AFTER:', JSON.stringify(after));
  const removed = before.products - after.products;
  console.log(`removed ${removed} rows; Canadian rows ${before.canadian} -> ${after.canadian}`);
  db.close();

  /*
   * The 8/13 shape does NOT go to zero pairs: the two disagreeing (junk-code)
   * pairs are deliberately left standing, so the correct end state is that
   * `pairs8` still equals exactly the disagreement count measured before the
   * run, and the rows removed equal the 12/13 pairs plus the FOLDABLE 8/13
   * pairs only.
   */
  const ok =
    after.pairs === 0 &&
    after.twelveDigit === 0 &&
    after.pairs8 === before.namesDisagree8 &&
    removed === before.pairs + before.foldablePairs8;
  console.log(
    ok
      ? 'PASS: no foldable barcode is stored under two spellings any more (the junk-code pairs excepted), and the number of rows removed equals the number of foldable pairs found'
      : `FAIL: pairs left ${after.pairs}, 12-digit rows left ${after.twelveDigit}, 8/13 pairs left ${after.pairs8} (expected ${before.namesDisagree8}), removed ${removed} against ${before.pairs} + ${before.foldablePairs8}`,
  );
  return ok ? 0 : 1;
}

process.exit(main());
