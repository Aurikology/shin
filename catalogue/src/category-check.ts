/**
 * The category load check (docs/category-safeguards-2026-10-08.md, Part A).
 *
 *   node src/category-check.ts --db data/catalogue.db --taxonomy data/off-categories.json --baseline category-baseline.json
 *
 * An offline job, so it STOPS: it prints all seven counts on every run and
 * exits non-zero when any count is above its recorded baseline, when the
 * taxonomy is missing, unreadable, empty or changed since the baseline, or when
 * the baseline itself is missing. The baseline is a ratchet: today's known
 * counts may not grow, and a fix lowers them by hand (the dbt data-test
 * practice the spec cites). Nothing here ever reads a missing reference as 0.
 *
 * The database is opened READ ONLY. This module never writes to it.
 *
 * Scope, written down because the counts mean nothing without it:
 *   A1 to A4   Canadian rows (sold_in_canada = 1) whose source is openfoodfacts and that carry tags
 *   A6         Canadian rows of any source that carry tags and have a NULL category_source
 *   A7         catch / except blocks in the category and range code that swallow an error
 */

import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { faultsOfPath, loadTaxonomy, TaxonomyError } from './category-taxonomy.ts';
import type { Taxonomy } from './category-taxonomy.ts';
import * as settings from '../../settings/src/index.ts';

export const COUNT_KEYS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'] as const;
export type CountKey = (typeof COUNT_KEYS)[number];

const LABELS: Record<CountKey, string> = {
  A1: 'two or more deepest categories on separate branches, none recorded',
  A2: 'tag read as parent is not a confirmed ancestor of the last tag',
  A3: 'products carrying a tag that is not in the taxonomy',
  A4: 'chosen leaf is an ancestor of another of the product\'s own tags',
  A5: 'taxonomy file missing, unreadable or changed (0 = fine, 1 = fault)',
  A6: 'tagged rows with a NULL category_source',
  A7: 'swallowing catch/except blocks in the category and range code',
};

export interface Baseline {
  readonly recorded: string;
  readonly taxonomy: { readonly sha256: string; readonly fetchedAt: string; readonly source: string };
  /** A5 is a status, not a count; it has no baseline entry. */
  readonly counts: Readonly<Record<'A1' | 'A2' | 'A3' | 'A4' | 'A6' | 'A7', number>>;
}

export type Counts = Record<CountKey, number>;

export interface CheckResult {
  readonly counts: Counts;
  readonly lines: readonly string[];
  readonly failures: readonly string[];
  readonly ok: boolean;
  /** The baseline counts the run was held to, or null when the baseline was unusable. */
  readonly baseline: Baseline['counts'] | null;
  /** A2 split: proven not the parent (last tag is in the taxonomy), versus cannot be checked (last tag is not in it). */
  readonly a2: { readonly proven: number; readonly unchecked: number };
}

/* --------------------------------------------------------------- A7 scan */

/** The files that make up the category and range path, relative to the repo root. */
export const A7_FILES: readonly string[] = [
  'catalogue/src/prepare_rows.py',
  'catalogue/src/prepare_rows_jsonl.py',
  'catalogue/src/load.ts',
  'catalogue/src/schema.ts',
  'catalogue/src/search.ts',
  'catalogue/src/alternatives.ts',
  'catalogue/src/category-taxonomy.ts',
  'catalogue/src/placement.ts',
  'catalogue/src/placement-cascade.ts',
  'catalogue/src/placement-run.ts',
  'catalogue/src/placement-feedback.ts',
  'catalogue/src/placement-audit.ts',
  'catalogue/src/name-meaning.ts',
  'catalogue/src/knn-worker.ts',
  'catalogue/src/placement-text-worker.ts',
  'price/src/range.ts',
  'app/src/catalogue-first.ts',
  'app/src/category-guard.ts',
  'app/src/category-map.ts',
];

export interface Swallow {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** A body "reports" an error when it rethrows it or sends it somewhere a person can read. */
const REPORTS_TS = /\bthrow\b|console\.|\bemit\s*\(|\blogError\b|\blog\w*\s*\(|\bwarn\w*\s*\(|process\.stderr/i;
const REPORTS_PY = /\braise\b|\bprint\s*\(|\blog\w*\.|sys\.stderr|\bwarn/i;

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Find catch / except blocks that neither rethrow nor log. Pure: takes the source text. */
export function findSwallows(file: string, source: string): Swallow[] {
  const out: Swallow[] = [];
  if (file.endsWith('.py')) {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)except\b.*:\s*(#.*)?$/.exec(lines[i]!);
      if (!m) continue;
      const indent = m[1]!.length;
      const body: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.trim() === '') continue;
        if (l.length - l.trimStart().length <= indent) break;
        body.push(l);
      }
      if (!REPORTS_PY.test(body.join('\n'))) out.push({ file, line: i + 1, text: lines[i]!.trim() });
    }
    return out;
  }
  const re = /\bcatch\s*(\([^)]*\))?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      i += 1;
    }
    const body = stripComments(source.slice(start, i - 1));
    if (!REPORTS_TS.test(body)) {
      const line = source.slice(0, m.index).split('\n').length;
      out.push({ file, line, text: source.split('\n')[line - 1]!.trim() });
    }
  }
  return out;
}

/** A7 over the real files; a file that cannot be read is a failure, not a zero. */
export function scanSwallows(root: string, files: readonly string[] = A7_FILES): { swallows: Swallow[]; unreadable: string[] } {
  const swallows: Swallow[] = [];
  const unreadable: string[] = [];
  for (const f of files) {
    try {
      swallows.push(...findSwallows(f, readFileSync(join(root, f), 'utf8')));
    } catch {
      unreadable.push(f);
    }
  }
  return { swallows, unreadable };
}

/* ------------------------------------------------------------ the check */

export interface CheckOptions {
  readonly db: string;
  readonly taxonomy: string;
  readonly baseline: string;
  /** Repo root, for the A7 scan. Default: two levels above this file. */
  readonly root?: string;
  /** Override the A7 file list (tests). */
  readonly a7Files?: readonly string[];
}

function readBaseline(path: string): Baseline {
  const b = JSON.parse(readFileSync(path, 'utf8')) as Baseline;
  for (const k of ['A1', 'A2', 'A3', 'A4', 'A6', 'A7'] as const) {
    if (typeof b.counts?.[k] !== 'number') throw new Error(`baseline has no number for ${k}`);
  }
  if (typeof b.taxonomy?.sha256 !== 'string' || b.taxonomy.sha256.length < 8) throw new Error('baseline has no taxonomy sha256');
  return b;
}

/** True when a category_rejected value names at least one tag (not NULL, not an empty list). No parsing, so nothing to swallow. */
function hasRejectedRecord(value: string | null): boolean {
  if (value === null) return false;
  const t = value.trim();
  return t !== '' && t !== '[]';
}

export function runCategoryCheck(opts: CheckOptions): CheckResult {
  const failures: string[] = [];
  const lines: string[] = [];
  const counts: Counts = { A1: 0, A2: 0, A3: 0, A4: 0, A5: 0, A6: 0, A7: 0 };
  const root = opts.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

  let baseline: Baseline | null = null;
  try {
    baseline = readBaseline(opts.baseline);
  } catch (err) {
    failures.push(`baseline unusable (${opts.baseline}): ${err instanceof Error ? err.message : String(err)}`);
  }

  // A5: the reference file.
  let tax: Taxonomy | null = null;
  try {
    tax = loadTaxonomy(opts.taxonomy);
    if (baseline && tax.sha256 !== baseline.taxonomy.sha256) {
      counts.A5 = 1;
      failures.push(`A5 taxonomy changed: sha256 ${tax.sha256} is not the baseline's ${baseline.taxonomy.sha256}`);
    }
  } catch (err) {
    counts.A5 = 1;
    failures.push(`A5 ${err instanceof TaxonomyError ? err.message : `taxonomy failed to load: ${String(err)}`}`);
  }

  // A7: the code audit as a ratchet.
  const scan = scanSwallows(root, opts.a7Files ?? A7_FILES);
  counts.A7 = scan.swallows.length;
  for (const f of scan.unreadable) failures.push(`A7 could not read ${f}`);

  // A1 to A4 and A6: the database. Opened read only.
  let tagged = 0;
  let twoPlus = 0;
  let canadianTagged = 0;
  let unparsable = 0;
  let a2Proven = 0;
  let a2Unchecked = 0;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(opts.db, { readOnly: true });
    const cols = (db.prepare('PRAGMA table_info(product)').all() as unknown as { name: string }[]).map((c) => c.name);
    if (cols.length === 0) throw new Error('no product table');
    const hasSource = cols.includes('category_source');
    // A migrated catalogue records the deepest tags a two-branch product did not take; an older one has no such column.
    const hasRejected = cols.includes('category_rejected');
    const sel = db.prepare(
      `SELECT category_path, source, ${hasSource ? 'category_source' : 'NULL'} AS category_source,
              ${hasRejected ? 'category_rejected' : 'NULL'} AS category_rejected
         FROM product WHERE sold_in_canada = 1 AND category_path IS NOT NULL AND category_path NOT IN ('', '[]')`,
    );
    for (const r of sel.iterate() as Iterable<{ category_path: string; source: string; category_source: string | null; category_rejected: string | null }>) {
      canadianTagged += 1;
      if (r.category_source === null) counts.A6 += 1;
      if (r.source !== 'openfoodfacts') continue;
      let tags: string[];
      try {
        const parsed: unknown = JSON.parse(r.category_path);
        if (!Array.isArray(parsed)) throw new Error('not an array');
        tags = parsed.filter((t): t is string => typeof t === 'string');
      } catch {
        unparsable += 1;
        continue;
      }
      if (tags.length === 0) continue;
      tagged += 1;
      if (tags.length >= 2) twoPlus += 1;
      if (!tax) continue;
      const f = faultsOfPath(tags, tax);
      // A1 is a pick made with NO record: a two-branch product whose category_rejected names the tags it left is recorded.
      if (f.includes('two_branches') && !hasRejectedRecord(r.category_rejected)) counts.A1 += 1;
      if (f.includes('parent_not_ancestor')) {
        counts.A2 += 1;
        if (tax.has(tags[tags.length - 1]!)) a2Proven += 1;
        else a2Unchecked += 1;
      }
      if (f.includes('unknown_tag')) counts.A3 += 1;
      if (f.includes('leaf_is_ancestor')) counts.A4 += 1;
    }
  } catch (err) {
    failures.push(`database unusable (${opts.db}): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try {
      db?.close();
    } catch {
      /* a read-only handle that will not close has nothing left to lose */
    }
  }
  if (unparsable > 0) failures.push(`${unparsable} category_path values are not a JSON array of strings`);
  if (!tax) failures.push('A1 to A4 NOT CHECKED: no taxonomy (a missing reference is a fault, not a zero)');

  const denom: Record<CountKey, string> = {
    A1: `of ${tagged}`,
    A2: `of ${twoPlus}`,
    A3: `of ${tagged}`,
    A4: `of ${tagged}`,
    A5: '',
    A6: `of ${canadianTagged}`,
    A7: `of ${A7_FILES.length} files`,
  };
  for (const k of COUNT_KEYS) {
    const base = baseline && k !== 'A5' ? baseline.counts[k] : k === 'A5' ? 0 : undefined;
    const checked = k === 'A7' || k === 'A5' || k === 'A6' ? true : tax !== null;
    const shown = checked ? String(counts[k]) : 'NOT CHECKED';
    lines.push(`${k}  ${shown.padStart(8)}  ${denom[k].padEnd(18)} baseline ${base === undefined ? '?' : String(base).padStart(8)}  ${LABELS[k]}`);
    if (checked && base !== undefined && counts[k] > base) failures.push(`${k} is ${counts[k]}, above its baseline ${base}: ${LABELS[k]}`);
    if (k === 'A2') lines.push(`    A2 split: ${tax ? a2Proven : 'NOT CHECKED'} proven not the parent; ${tax ? a2Unchecked : 'NOT CHECKED'} cannot be checked (the last tag is not in the taxonomy)`);
  }
  for (const s of scan.swallows) lines.push(`    A7 ${s.file}:${s.line}  ${s.text}`);

  return { counts, lines, failures, ok: failures.length === 0, baseline: baseline ? baseline.counts : null, a2: { proven: a2Proven, unchecked: a2Unchecked } };
}

/* ------------------------------------------------------------------- CLI */

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** The file the last run is written to: next to the database, so it lives where the catalogue lives. */
export const LAST_RESULT_FILE = 'category-check-last.json';

export interface LastResult {
  readonly at: string;
  /** The exit status this run returned. */
  readonly exit: number;
  readonly counts: Counts | null;
  readonly baseline: Baseline['counts'] | null;
  readonly failures: readonly string[];
}

/**
 * Write the last result beside the database (atomic: temp file, then rename), so a
 * fault reaches a place a person sees (the session start line), not only a log.
 * Returns an error message when it could not be written; the caller prints it.
 */
export function writeLastResult(dbPath: string, result: LastResult): string | null {
  const dir = dirname(resolve(dbPath));
  const file = join(dir, LAST_RESULT_FILE);
  try {
    writeFileSync(`${file}.part`, JSON.stringify(result, null, 2));
    renameSync(`${file}.part`, file);
    return null;
  } catch (err) {
    return `could not write ${file}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function main(argv: readonly string[]): number {
  const here = dirname(fileURLToPath(import.meta.url));
  const catalogueDir = resolve(here, '..');
  const db = arg('--db', argv) ?? settings.SHIN_CATALOGUE() ?? join(catalogueDir, 'data', 'catalogue.db');
  const taxonomy = arg('--taxonomy', argv) ?? join(catalogueDir, 'data', 'off-categories.json');
  const baseline = arg('--baseline', argv) ?? join(catalogueDir, 'category-baseline.json');
  let status: number;
  let last: LastResult;
  if (!existsSync(db)) {
    console.error(`category check: database not found: ${db}`);
    status = 2;
    last = { at: new Date().toISOString(), exit: 2, counts: null, baseline: null, failures: [`database not found: ${db}`] };
  } else {
    const r = runCategoryCheck({ db, taxonomy, baseline });
    console.log(`category check  db=${db}`);
    for (const l of r.lines) console.log(l);
    if (r.ok) console.log('category check: OK, no count above its baseline');
    else for (const f of r.failures) console.error(`category check FAILED: ${f}`);
    status = r.ok ? 0 : 1;
    last = { at: new Date().toISOString(), exit: status, counts: r.counts, baseline: r.baseline, failures: r.failures };
  }
  const werr = writeLastResult(db, last);
  if (werr) console.error(`category check: ${werr}`);
  return status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
