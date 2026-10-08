/**
 * Rewrite every Open Food Facts product's category path into one canonical chain
 * (docs/category-safeguards-2026-10-08.md; B1, B2, B3).
 *
 *   node src/category-canonicalize.ts --db <catalogue.db> [--undo] [--taxonomy <path>] [--aliases <path>]
 *
 * WHAT IT DOES. For each row with source = 'openfoodfacts' and tags:
 *   1. keeps the tags exactly as the source gave them in `category_tags_raw` (copied from
 *      `category_path` ONLY when that column is NULL, so raw is never overwritten), and the
 *      old `leaf_category` in `leaf_category_raw` so --undo can put both back byte for byte;
 *   2. resolves each label to a taxonomy entry (exact key, name or synonym, alias file);
 *   3. picks the leaf (category-pick.ts pickLeaf) and the one chain above it (canonicalChain);
 *   4. writes `category_path` = the chain (root to leaf), `leaf_category` = the leaf, and
 *      `category_rejected` = the other deepest tags a two-branch product did not take.
 * A row where NO tag resolves is left exactly as it was and counted. Then it rebuilds the
 * product_category index (rebuildCategories) from the new paths.
 *
 * FAILS LOUDLY (RULINGS.md, "Errors never go unnoticed"). A missing or unreadable taxonomy stops
 * the job before anything is written. The row count is read before and after; if the two differ
 * the job exits non-zero. A row whose stored tags are not valid JSON is left alone, counted as
 * `malformed`, and also makes the job exit non-zero. Every count is printed on every run.
 *
 * IDEMPOTENT. A second run reads the same raw tags and writes the same values; it changes
 * nothing and reports 0 rewritten. Writes go in batched transactions.
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_ALIASES_PATH, DEFAULT_TAXONOMY_PATH, foldTag, loadTaxonomy } from './category-taxonomy.ts';
import type { Taxonomy } from './category-taxonomy.ts';
import { canonicalChain, pickLeaf } from './category-pick.ts';
import { rebuildCategories } from './schema.ts';
import type { RebuildCategoriesResult } from './schema.ts';

export const BATCH_ROWS = 5000;

export interface CanonicalizeOptions {
  readonly taxonomy: Taxonomy;
  /** Priced products per tag; the first tie-break of pickLeaf. Defaults to none (catalogue members decide). */
  readonly pricedCount?: (tag: string) => number;
  readonly batchSize?: number;
  readonly log?: (line: string) => void;
}

export interface CanonicalizeResult {
  readonly examined: number;
  readonly rewritten: number;
  readonly unresolved: number;
  readonly malformed: number;
  readonly rowsBefore: number;
  readonly rowsAfter: number;
  readonly rebuild: RebuildCategoriesResult;
  /** True when the row counts match and no row was malformed. */
  readonly ok: boolean;
}

interface Row {
  rowid: number;
  code: string;
  category_path: string;
  leaf_category: string | null;
  category_tags_raw: string | null;
  leaf_category_raw: string | null;
  category_rejected: string | null;
}

const COLUMNS: [string, string][] = [
  ['category_tags_raw', 'TEXT'],
  ['category_rejected', 'TEXT'],
  ['leaf_category_raw', 'TEXT'],
];

/** The additive migration: three nullable columns, added only when missing. */
export function ensureCanonicalColumns(db: DatabaseSync): void {
  const have = new Set((db.prepare('PRAGMA table_info(product)').all() as unknown as { name: string }[]).map((r) => r.name));
  for (const [name, type] of COLUMNS) if (!have.has(name)) db.exec(`ALTER TABLE product ADD COLUMN ${name} ${type}`);
}

function countProducts(db: DatabaseSync): number {
  return (db.prepare('SELECT count(*) AS n FROM product').get() as { n: number }).n;
}

/** Every eligible row, in rowid order, a batch at a time. */
function* eligibleRows(db: DatabaseSync, batch: number): Generator<Row[]> {
  const stmt = db.prepare(
    `SELECT rowid, code, category_path, leaf_category, category_tags_raw, leaf_category_raw, category_rejected
       FROM product
      WHERE source = 'openfoodfacts' AND rowid > ?
      ORDER BY rowid LIMIT ?`,
  );
  let last = 0;
  for (;;) {
    const rows = stmt.all(last, batch) as unknown as Row[];
    if (rows.length === 0) return;
    yield rows;
    last = rows[rows.length - 1]!.rowid;
  }
}

/** Parse a stored tag list; null when it is not a JSON array of strings. An empty list is returned as []. */
function parseTags(text: string | null): string[] | null {
  if (text === null) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  } catch {
    return null;
  }
}

/** The distinct taxonomy keys a list of labels resolves to, in first-seen order. */
function resolveAll(labels: readonly string[], tax: Taxonomy): string[] {
  const out: string[] = [];
  for (const l of labels) {
    const k = tax.resolveLabel(l);
    if (k !== null && !out.includes(k)) out.push(k);
  }
  return out;
}

function runInTransaction(db: DatabaseSync, work: () => void): void {
  db.exec('BEGIN');
  try {
    work();
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackErr) {
      console.error(`category-canonicalize: ROLLBACK also failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`);
    }
    throw err;
  }
}

/** Migrate the catalogue in place and rebuild the category index. Throws on a fault that stops the job. */
export function canonicalizeCatalogue(db: DatabaseSync, options: CanonicalizeOptions): CanonicalizeResult {
  const tax = options?.taxonomy;
  if (!tax || typeof tax.resolveLabel !== 'function') throw new Error('category-canonicalize needs a taxonomy; it will not run without one');
  const log = options.log ?? ((l: string) => console.log(l));
  const batch = options.batchSize ?? BATCH_ROWS;
  const priced = options.pricedCount ?? (() => 0);
  ensureCanonicalColumns(db);
  const rowsBefore = countProducts(db);

  // Pass 1: how many catalogue products carry each resolved tag (a tie-break for leaf and parent).
  const members = new Map<string, number>();
  for (const rows of eligibleRows(db, batch)) {
    for (const r of rows) {
      const tags = parseTags(r.category_tags_raw ?? r.category_path);
      if (!tags) continue;
      for (const k of resolveAll(tags, tax)) members.set(k, (members.get(k) ?? 0) + 1);
    }
  }
  const memberCount = (tag: string): number => members.get(foldTag(tag)) ?? 0;

  // Pass 2: rewrite.
  let examined = 0;
  let rewritten = 0;
  let unresolved = 0;
  let malformed = 0;
  const update = db.prepare(
    `UPDATE product SET category_path = ?, leaf_category = ?, category_rejected = ?, category_tags_raw = ?, leaf_category_raw = ? WHERE rowid = ?`,
  );
  for (const rows of eligibleRows(db, batch)) {
    runInTransaction(db, () => {
      for (const r of rows) {
        const rawText = r.category_tags_raw ?? r.category_path;
        const tags = parseTags(rawText);
        if (tags === null) {
          malformed += 1;
          examined += 1;
          continue;
        }
        if (tags.length === 0) continue; // no tags: nothing to examine
        examined += 1;
        const keys = resolveAll(tags, tax);
        if (keys.length === 0) {
          unresolved += 1;
          continue;
        }
        const { leaf, rejected } = pickLeaf(keys, tax, priced, memberCount);
        const chain = canonicalChain(leaf, keys, tax, memberCount);
        const newPath = JSON.stringify(chain);
        const newRejected = JSON.stringify(rejected);
        const newRaw = r.category_tags_raw ?? r.category_path; // never overwritten once set
        const newLeafRaw = r.category_tags_raw === null ? r.leaf_category : r.leaf_category_raw;
        if (
          r.category_path === newPath &&
          r.leaf_category === leaf &&
          r.category_rejected === newRejected &&
          r.category_tags_raw === newRaw &&
          r.leaf_category_raw === newLeafRaw
        ) {
          continue;
        }
        update.run(newPath, leaf, newRejected, newRaw, newLeafRaw, BigInt(r.rowid));
        rewritten += 1;
      }
    });
  }

  const rebuild = rebuildCategories(db, { taxonomy: tax, log });
  const rowsAfter = countProducts(db);
  const ok = rowsAfter === rowsBefore && malformed === 0;
  log(
    `category-canonicalize: examined ${examined}, rewritten ${rewritten}, left unresolved ${unresolved}, malformed ${malformed}; ` +
      `product rows before ${rowsBefore}, after ${rowsAfter}${ok ? '' : '  FAILED'}`,
  );
  return { examined, rewritten, unresolved, malformed, rowsBefore, rowsAfter, rebuild, ok };
}

export interface UndoResult {
  readonly restored: number;
  readonly rowsBefore: number;
  readonly rowsAfter: number;
  readonly rebuild: RebuildCategoriesResult;
  readonly ok: boolean;
}

/** Put the raw tags (and the old leaf) back exactly, clear the rejected records, and rebuild the index. */
export function undoCanonicalize(db: DatabaseSync, options: { taxonomy: Taxonomy; log?: (line: string) => void }): UndoResult {
  const tax = options?.taxonomy;
  if (!tax || typeof tax.resolveLabel !== 'function') throw new Error('category-canonicalize --undo needs a taxonomy to rebuild the index; it will not run without one');
  const log = options.log ?? ((l: string) => console.log(l));
  ensureCanonicalColumns(db);
  const rowsBefore = countProducts(db);
  let restored = 0;
  runInTransaction(db, () => {
    const r = db
      .prepare(
        `UPDATE product
            SET category_path = category_tags_raw, leaf_category = leaf_category_raw, category_rejected = NULL
          WHERE source = 'openfoodfacts' AND category_tags_raw IS NOT NULL
            AND (category_path IS NOT category_tags_raw OR leaf_category IS NOT leaf_category_raw OR category_rejected IS NOT NULL)`,
      )
      .run();
    restored = Number(r.changes);
  });
  const rebuild = rebuildCategories(db, { taxonomy: tax, log });
  const rowsAfter = countProducts(db);
  const ok = rowsAfter === rowsBefore;
  log(`category-canonicalize --undo: restored ${restored}; product rows before ${rowsBefore}, after ${rowsAfter}${ok ? '' : '  FAILED'}`);
  return { restored, rowsBefore, rowsAfter, rebuild, ok };
}

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv: readonly string[]): number {
  const dbPath = arg('--db', argv);
  if (!dbPath) {
    console.error('category-canonicalize FAILED: --db <catalogue.db> is required');
    return 2;
  }
  let tax: Taxonomy;
  try {
    tax = loadTaxonomy(arg('--taxonomy', argv) ?? DEFAULT_TAXONOMY_PATH, { aliasesPath: arg('--aliases', argv) ?? DEFAULT_ALIASES_PATH });
  } catch (err) {
    console.error(`category-canonicalize FAILED before touching anything: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const db = new DatabaseSync(dbPath);
  try {
    const r = argv.includes('--undo') ? undoCanonicalize(db, { taxonomy: tax }) : canonicalizeCatalogue(db, { taxonomy: tax });
    return r.ok ? 0 : 1;
  } catch (err) {
    console.error(`category-canonicalize FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
