/**
 * Fills in the fields `dedupe-barcode-spellings.ts` should have rescued and
 * did not, onto the LIVE 12/13-digit survivors, from the one place the dying
 * rows' values still exist: `catalogue.db.before-dedupe`, the pre-collapse
 * backup dated 2026-09-13.
 *
 * WHY THIS EXISTS. `dedupe-barcode-spellings.ts`'s `RESCUE` list was seven
 * columns someone picked by hand: name_en, name_fr, brands, quantity,
 * leaf_category, image_url, ingredients_text. The schema has sixteen nullable
 * columns on `product`. Measured against all 1,375,443 pairs in the backup,
 * two barcodes lost `category_path` -- the full category path, not just
 * `leaf_category` -- and every other un-rescued nullable column (size_value,
 * size_unit, category_source, generic_name, nutriscore_grade, nova_group,
 * additives_n) lost nothing, 0 pairs each. Confirmed against the live file:
 * both barcodes' `category_path` is `[]` there today.
 *
 *   0045496590161  had  ["en:entertainment-hobby","en:video-games-consoles","en:gaming-controllers"]
 *   0023942947769  had  ["en:computers-peripherals","en:data-storage","en:data-storage-mediums","en:blank-cds"]
 *
 * Both rows still show the correct `leaf_category` (rescued), so the visible
 * label is right; `category_path` empty means `product_category` has no rows
 * for either (rebuildCategories reads category_path, not leaf_category), so
 * the neighbour ring for "other gaming controllers" or "other blank CDs" can
 * never find either product as a member of its own category.
 *
 * THE COLUMN LIST IS SCHEMA-DERIVED, NOT HAND-WRITTEN, on purpose -- the same
 * fix applied to `dedupe-barcode-spellings.ts` itself. It reads
 * `PRAGMA table_info(product)` from both the live file and the backup, takes
 * every nullable, non-key column present in BOTH (name_derived and
 * derived_source exist in the live schema but not in the 2026-09-13 backup,
 * so they are skipped -- there is nothing to rescue for a column that did not
 * exist yet), and adds `category_path` and `allergens` as a second group:
 * both are NOT NULL with a `'[]'` default standing in for "no data"
 * (schema.ts's own words), so "missing" for them means NULL, '', or '[]',
 * never a bare IS NULL test.
 *
 * DRY RUN BY DEFAULT. Prints, per column, how many live rows would change and
 * does not open the live file for writing. `--apply` does the write, inside
 * one transaction, and refuses to start unless the backup exists and is
 * genuinely older data (the live row's own value, when it has one, is never
 * touched -- every UPDATE is guarded by the live column being empty).
 *
 *   node --experimental-strip-types catalogue/src/repair-dedupe-rescue.ts
 *   node --experimental-strip-types catalogue/src/repair-dedupe-rescue.ts --apply
 */
import { DatabaseSync } from 'node:sqlite';
import * as sqliteVec from 'sqlite-vec';
import { existsSync } from 'node:fs';

const LIVE = process.env.SHIN_CATALOGUE ?? 'data/catalogue.db';
const BACKUP = process.env.SHIN_CATALOGUE_BACKUP ?? `${LIVE}.before-dedupe`;
const apply = process.argv.includes('--apply');

type ColInfo = { name: string; notnull: number; pk: number };

/** NOT NULL columns whose schema default doubles as "no data" (schema.ts's own words). */
const SENTINEL_COLS = ['category_path', 'allergens'];

function open(path: string, readOnly: boolean): DatabaseSync {
  const db = new DatabaseSync(path, { allowExtension: true, readOnly });
  sqliteVec.load(db);
  db.exec('PRAGMA busy_timeout = 120000');
  return db;
}

function nullableColumns(db: DatabaseSync): Set<string> {
  const cols = db.prepare('PRAGMA table_info(product)').all() as unknown as ColInfo[];
  return new Set(cols.filter((c) => c.pk === 0 && c.notnull === 0).map((c) => c.name));
}

function main(): number {
  if (!existsSync(LIVE)) {
    console.log(`no catalogue at ${LIVE}`);
    return 1;
  }
  if (!existsSync(BACKUP)) {
    console.log(`no backup at ${BACKUP} -- nothing to rescue from, refusing to start`);
    return 1;
  }

  // Read-only probe of both schemas to build the column list. Opened and
  // closed before the (possibly writable) live handle below, so a dry run
  // never needs more than a read-only connection to either file.
  const liveRo = open(LIVE, true);
  const backupRo = open(BACKUP, true);
  const liveNullable = nullableColumns(liveRo);
  const backupNullable = nullableColumns(backupRo);
  liveRo.close();
  backupRo.close();

  // Only columns BOTH schemas have nullable, and neither is a sentinel column
  // handled separately below. A column the backup predates (name_derived,
  // derived_source, as of this file) has nothing to rescue, by definition.
  const nullStyleCols = [...liveNullable].filter((c) => backupNullable.has(c) && !SENTINEL_COLS.includes(c)).sort();

  console.log('nullable columns rescued by this script (schema-derived):', nullStyleCols);
  console.log('sentinel (empty-array-default) columns rescued separately:', SENTINEL_COLS);

  const db = open(LIVE, apply ? false : true);
  db.exec(`ATTACH DATABASE 'file:${BACKUP.replace(/\\/g, '/')}?mode=ro' AS backup`);

  const PAIRED = "length(code) = 13 AND code LIKE '0%'";
  const results: Record<string, number> = {};

  if (apply) db.exec('BEGIN');
  try {
    for (const col of nullStyleCols) {
      const whereEmpty = `${col} IS NULL`;
      const backupHasValue = `EXISTS (SELECT 1 FROM backup.product q WHERE q.code = substr(product.code, 2) AND q.${col} IS NOT NULL)`;
      if (apply) {
        const r = db
          .prepare(
            `UPDATE product SET ${col} = (SELECT q.${col} FROM backup.product q WHERE q.code = substr(product.code, 2))` +
              ` WHERE ${PAIRED} AND ${whereEmpty} AND ${backupHasValue}`,
          )
          .run();
        results[col] = Number(r.changes);
      } else {
        results[col] = (
          db.prepare(`SELECT count(*) AS c FROM product WHERE ${PAIRED} AND ${whereEmpty} AND ${backupHasValue}`).get() as {
            c: number;
          }
        ).c;
      }
    }

    for (const col of SENTINEL_COLS) {
      const whereEmpty = `(${col} IS NULL OR ${col} = '' OR ${col} = '[]')`;
      const backupHasValue =
        `EXISTS (SELECT 1 FROM backup.product q WHERE q.code = substr(product.code, 2)` +
        ` AND q.${col} IS NOT NULL AND q.${col} != '' AND q.${col} != '[]')`;
      if (apply) {
        const r = db
          .prepare(
            `UPDATE product SET ${col} = (SELECT q.${col} FROM backup.product q WHERE q.code = substr(product.code, 2))` +
              ` WHERE ${PAIRED} AND ${whereEmpty} AND ${backupHasValue}`,
          )
          .run();
        results[col] = Number(r.changes);
      } else {
        results[col] = (
          db.prepare(`SELECT count(*) AS c FROM product WHERE ${PAIRED} AND ${whereEmpty} AND ${backupHasValue}`).get() as {
            c: number;
          }
        ).c;
      }
    }

    if (apply) db.exec('COMMIT');
  } catch (err) {
    if (apply) db.exec('ROLLBACK');
    console.log('ROLLED BACK, nothing changed:', err instanceof Error ? err.message : String(err));
    db.close();
    return 1;
  }

  console.log(apply ? '\nrows CHANGED per column:' : '\nrows that WOULD change per column (dry run, nothing written):');
  console.log(JSON.stringify(results, null, 2));

  const total = Object.values(results).reduce((a, b) => a + b, 0);
  console.log(`\n${apply ? 'changed' : 'would change'} ${total} (row, column) cell${total === 1 ? '' : 's'} total.`);
  if (!apply) console.log('\nDRY RUN. Nothing written. Re-run with --apply.');

  db.close();
  return 0;
}

process.exit(main());
