/**
 * purge-source: delete ONE external source's rows from the price and catalogue databases.
 *
 *   node price/src/purge-source.ts <source> --prices <prices.db> --catalogue <catalogue.db> [--dry-run] [--yes]
 *
 * WHY. Decision 2026-11-25: every external source stays, but any one must be removable if its owner
 * objects. The kill switch (SHIN_EXCLUDED_SOURCES, catalogue/src/source-rights.ts) takes a source out
 * of shopper answers at once, rows still on disk; this command is the second step, the one that
 * removes the data itself. It deletes only the named source's rows. `<source>` is a switch name from
 * the table in source-rights.ts (kroger, hammer, openfoodfacts, ...), so one name covers a company's
 * price rows and its catalogue rows; a name not in the table is refused, because a purge is not
 * something to run on a guess.
 *
 * WHAT GOES.
 *   prices db      `observation` rows whose seller is the source's, and every copy the append-only
 *                  keep-everything tables hold of them (observation_log, intake_batch_row, ...:
 *                  any other table with a `seller` column; the source registry's own audit tables
 *                  stay, they hold no price data). Those tables refuse deletes, so their
 *                  no-delete triggers are lifted inside the one transaction and put back as they were.
 *   catalogue db   `product` rows whose source is the source's, with their search-index entry,
 *                  vector, category links, placement, placement confirmations and cached answers.
 *
 * SAFETY. Without --yes (and without --dry-run) it refuses and changes nothing. --dry-run prints
 * the counts and changes nothing. Each database is purged in one transaction: all or nothing.
 */

import { DatabaseSync } from 'node:sqlite';
import { openPrices } from './store.ts';
import { openCatalogue, FTS_COLUMNS } from '../../catalogue/src/schema.ts';
import { SOURCE_SWITCHES } from '../../catalogue/src/source-rights.ts';

/** Tables with a `seller` column that are the registry's audit trail, not price data. */
const KEEP_TABLES = new Set(['source_registry', 'source_use']);

export interface PurgeCounts {
  /** Rows of the source per table, before. */
  readonly before: Record<string, number>;
  /** Rows of the source per table, after (all 0 after a real run; equal to `before` on a dry run). */
  readonly after: Record<string, number>;
  /** Rows of every source per database, before and after. */
  readonly totals: { readonly before: Record<string, number>; readonly after: Record<string, number> };
}

function count(db: DatabaseSync, sql: string, ...args: string[]): number {
  return Number((db.prepare(sql).get(...args) as { n: number }).n);
}

function tablesWith(db: DatabaseSync, column: string): string[] {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
  return tables.filter((t) => {
    try {
      return (db.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).some((c) => c.name === column);
    } catch {
      return false;
    }
  });
}

const marks = (xs: readonly unknown[]): string => xs.map(() => '?').join(', ');

/** Purges the source from a prices database. `sellers` are lower-cased seller names. */
export function purgePrices(db: DatabaseSync, sellers: readonly string[], dry: boolean): PurgeCounts {
  const tables = tablesWith(db, 'seller').filter((t) => !KEEP_TABLES.has(t));
  const where = `lower(seller) IN (${marks(sellers)})`;
  const measure = (): Record<string, number> => Object.fromEntries(tables.map((t) => [t, sellers.length === 0 ? 0 : count(db, `SELECT count(*) AS n FROM "${t}" WHERE ${where}`, ...sellers)]));
  const total = (): Record<string, number> => ({ observation: count(db, 'SELECT count(*) AS n FROM observation') });
  const before = measure();
  const totalBefore = total();
  if (!dry && sellers.length > 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      // The observation delete trigger copies each row into the log first; the log is purged after it.
      const ordered = ['observation', ...tables.filter((t) => t !== 'observation')];
      for (const t of ordered) {
        const lifted = (db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND name LIKE '%no_delete%'").all(t) as { name: string; sql: string }[]);
        for (const trg of lifted) db.exec(`DROP TRIGGER "${trg.name}"`);
        db.prepare(`DELETE FROM "${t}" WHERE ${where}`).run(...sellers);
        for (const trg of lifted) db.exec(trg.sql);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return { before, after: measure(), totals: { before: totalBefore, after: total() } };
}

/** Purges the source from a catalogue database. */
export function purgeCatalogue(db: DatabaseSync, sources: readonly string[], dry: boolean): PurgeCounts {
  const has = (t: string): boolean => db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?').get(t) !== undefined;
  const inSource = `source IN (${marks(sources)})`;
  const measure = (): Record<string, number> => {
    if (sources.length === 0) return { product: 0 };
    const out: Record<string, number> = { product: count(db, `SELECT count(*) AS n FROM product WHERE ${inSource}`, ...sources) };
    if (has('product_vec')) out.product_vec = count(db, `SELECT count(*) AS n FROM product_vec WHERE rowid IN (SELECT rowid FROM product WHERE ${inSource})`, ...sources);
    if (has('product_category')) out.product_category = count(db, `SELECT count(*) AS n FROM product_category WHERE rowid_ref IN (SELECT rowid FROM product WHERE ${inSource})`, ...sources);
    return out;
  };
  const totals = (): Record<string, number> => ({ product: count(db, 'SELECT count(*) AS n FROM product') });
  const before = measure();
  const totalBefore = totals();
  if (!dry && sources.length > 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('CREATE TEMP TABLE purge_rows (rowid_ INTEGER PRIMARY KEY, code TEXT NOT NULL)');
      db.prepare(`INSERT INTO purge_rows SELECT rowid, code FROM product WHERE ${inSource}`).run(...sources);
      // External-content FTS: the index entry is removed with the row's own old values.
      const cols = FTS_COLUMNS.join(', ');
      db.exec(`INSERT INTO product_fts (product_fts, rowid, ${cols}) SELECT 'delete', rowid, ${cols} FROM product WHERE rowid IN (SELECT rowid_ FROM purge_rows)`);
      if (has('product_vec')) db.exec('DELETE FROM product_vec WHERE rowid IN (SELECT rowid_ FROM purge_rows)');
      if (has('product_category')) db.exec('DELETE FROM product_category WHERE rowid_ref IN (SELECT rowid_ FROM purge_rows)');
      db.exec('DELETE FROM product WHERE rowid IN (SELECT rowid_ FROM purge_rows)');
      // item_placement refuses a delete while the product exists, so it goes after the product.
      for (const t of ['item_placement', 'placement_confirmation', 'lookup_answer']) {
        if (has(t)) db.exec(`DELETE FROM ${t} WHERE code IN (SELECT code FROM purge_rows)`);
      }
      db.exec('DROP TABLE purge_rows');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return { before, after: measure(), totals: { before: totalBefore, after: totals() } };
}

export interface PurgeOptions {
  readonly source: string;
  readonly pricesPath?: string;
  readonly cataloguePath?: string;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export interface PurgeReport {
  readonly prices?: PurgeCounts;
  readonly catalogue?: PurgeCounts;
}

/** Runs the purge. Throws (changing nothing) on an unknown source, no database, or a real run without `yes`. */
export function purgeSource(o: PurgeOptions): PurgeReport {
  const sw = SOURCE_SWITCHES[o.source.trim().toLowerCase()];
  if (!sw) throw new Error(`purge-source: "${o.source}" is not a known source; known: ${Object.keys(SOURCE_SWITCHES).join(', ')}`);
  if (!o.pricesPath && !o.cataloguePath) throw new Error('purge-source: give --prices <db>, --catalogue <db>, or both');
  if (!o.dryRun && !o.yes) throw new Error('purge-source: this deletes rows for good; rerun with --yes to do it, or --dry-run to only count');
  const out: { prices?: PurgeCounts; catalogue?: PurgeCounts } = {};
  if (o.pricesPath) {
    const db = openPrices(o.pricesPath);
    try {
      out.prices = purgePrices(db, sw.sellers.map((s) => s.toLowerCase()), o.dryRun);
    } finally {
      db.close();
    }
  }
  if (o.cataloguePath) {
    const db = openCatalogue(o.cataloguePath);
    try {
      out.catalogue = purgeCatalogue(db, sw.catalogue, o.dryRun);
    } finally {
      db.close();
    }
  }
  return out;
}

function show(label: string, c: PurgeCounts, log: (l: string) => void): void {
  for (const t of Object.keys(c.before)) log(`${label} ${t}: ${c.before[t]} rows of this source before, ${c.after[t]} after`);
  for (const t of Object.keys(c.totals.before)) log(`${label} ${t} (all sources): ${c.totals.before[t]} before, ${c.totals.after[t]} after`);
}

function main(): void {
  const argv = process.argv.slice(2);
  const flag = (n: string): string | undefined => {
    const i = argv.indexOf(n);
    return i === -1 ? undefined : argv[i + 1];
  };
  const source = argv[0];
  if (!source || source.startsWith('--')) {
    console.error('usage: node price/src/purge-source.ts <source> --prices <prices.db> --catalogue <catalogue.db> [--dry-run] [--yes]');
    process.exit(2);
  }
  try {
    const dryRun = argv.includes('--dry-run');
    const report = purgeSource({ source, pricesPath: flag('--prices'), cataloguePath: flag('--catalogue'), dryRun, yes: argv.includes('--yes') });
    console.log(`purge-source ${source}${dryRun ? ' (DRY RUN, nothing changed)' : ''}`);
    if (report.prices) show('prices', report.prices, console.log);
    if (report.catalogue) show('catalogue', report.catalogue, console.log);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.filename === process.argv[1]) main();
