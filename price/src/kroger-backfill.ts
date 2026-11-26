/**
 * Backfill: give the EXISTING `kroger-names` catalogue rows the department their
 * Kroger category says (kroger-departments.ts), instead of their source's 'food'.
 * Fresh loads carry it already (kroger-names.ts writes `department` on each row).
 *
 *   node price/src/kroger-backfill.ts <kroger_products.csv> --catalogue <catalogue.db> [--dry-run]
 *
 * ONLY rows whose `source` is 'kroger-names' are touched, matched by barcode.
 * A row whose barcode is not in the file, or whose category has no mapping, is left
 * exactly as it is and counted. Prints rows per department before and after; with
 * --dry-run it opens the database read-only and changes nothing.
 */

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { canonicalCode } from '../../catalogue/src/barcode.ts';
import { departmentOfRow } from '../../catalogue/src/placement.ts';
import { readKroger, SELLER } from './kroger-names.ts';

export interface BackfillReport {
  readonly dryRun: boolean;
  readonly rows: number;
  readonly before: Record<string, number>;
  readonly after: Record<string, number>;
  readonly changed: number;
  /** kroger-names rows whose barcode is not in the file: unchanged. */
  readonly notInFile: number;
  /** kroger-names rows whose category has no mapping: unchanged. */
  readonly unmappedRows: number;
  /** File barcodes by unmapped category value. */
  readonly unmappedCategories: Record<string, number>;
}

function bump(m: Record<string, number>, k: string): void {
  m[k] = (m[k] ?? 0) + 1;
}

/** Run the backfill on an open database. `dryRun` writes nothing (and adds no column). */
export function backfillKrogerDepartments(db: DatabaseSync, csvText: string, dryRun: boolean): BackfillReport {
  const parsed = readKroger(csvText);
  const want = new Map<string, string | null>();
  for (const p of parsed.products) want.set(canonicalCode(p.code), p.department ?? null);

  const hasColumn = (db.prepare('PRAGMA table_info(product)').all() as { name: string }[]).some((c) => c.name === 'department');
  if (!hasColumn && !dryRun) db.exec('ALTER TABLE product ADD COLUMN department TEXT');
  const rows = db
    .prepare(`SELECT code, source, ${hasColumn || !dryRun ? 'department' : 'NULL AS department'} FROM product WHERE source = ?`)
    .all(SELLER) as { code: string; source: string; department: string | null }[];

  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  const updates: { code: string; department: string }[] = [];
  let notInFile = 0;
  let unmappedRows = 0;
  for (const r of rows) {
    const cur = departmentOfRow(r.source, r.department);
    bump(before, cur);
    const target = want.get(canonicalCode(r.code));
    if (target === undefined) notInFile += 1;
    else if (target === null) unmappedRows += 1;
    if (target === undefined || target === null) {
      bump(after, cur);
      continue;
    }
    bump(after, target);
    if (target !== cur) updates.push({ code: r.code, department: target });
  }

  if (!dryRun && updates.length > 0) {
    const set = db.prepare('UPDATE product SET department = ? WHERE code = ? AND source = ?');
    db.exec('BEGIN');
    try {
      for (const u of updates) set.run(u.department, u.code, SELLER);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return {
    dryRun,
    rows: rows.length,
    before,
    after,
    changed: updates.length,
    notInFile,
    unmappedRows,
    unmappedCategories: parsed.unmapped,
  };
}

function fmt(m: Record<string, number>): string {
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
}

function main(): void {
  const argv = process.argv.slice(2);
  const csv = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
  const ci = argv.indexOf('--catalogue');
  const dbPath = ci === -1 ? undefined : argv[ci + 1];
  const dryRun = argv.includes('--dry-run');
  if (!csv || !dbPath) {
    console.error('usage: node price/src/kroger-backfill.ts <kroger_products.csv> --catalogue <catalogue.db> [--dry-run]');
    process.exit(2);
  }
  const db = new DatabaseSync(dbPath, { readOnly: dryRun });
  try {
    const r = backfillKrogerDepartments(db, readFileSync(csv, 'utf8'), dryRun);
    console.log(`kroger-backfill${dryRun ? ' (dry run, nothing written)' : ''}: ${r.rows} kroger-names rows`);
    console.log(`  before: ${fmt(r.before)}`);
    console.log(`  after:  ${fmt(r.after)}`);
    console.log(`  ${dryRun ? 'would change' : 'changed'} ${r.changed} rows; ${r.notInFile} rows not in the file and ${r.unmappedRows} rows with an unmapped category left as they are`);
    if (Object.keys(r.unmappedCategories).length > 0) {
      console.error(`kroger-backfill: WARNING categories with no department mapping: ${JSON.stringify(r.unmappedCategories)}`);
    }
  } finally {
    db.close();
  }
}

if (import.meta.filename === process.argv[1]) main();
