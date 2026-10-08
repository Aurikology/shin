/**
 * The serve-time category safeguard (docs/category-safeguards-2026-10-08.md,
 * Part A, A2 and A5).
 *
 * WHAT IT DOES. When an answer's price range, verdict or substitute ring used a
 * PARENT rung, the tag read as "parent" (the one before the leaf in the stored
 * path) must be an ancestor of the leaf in the Open Food Facts taxonomy. When it
 * is not, the guard records the fault: one log line `[category-fault] <kind>
 * <barcode>`, a count by kind that `/api/health` shows, and the kind returned to
 * the caller so it can ride on the answer's record.
 *
 * WHAT IT NEVER DOES. It never blocks, changes or delays an answer. Shore, "Fail
 * Fast" (IEEE Software, 2004): a crash is never appropriate for a shopper's
 * answer; the fault is brought to the developers' attention instead. "Always
 * answer" (RULINGS.md) stands. `check` does not throw and has no catch block.
 *
 * WHEN THE TAXONOMY DID NOT LOAD the check is OFF and says so, in those words,
 * on `/api/health` ("category check off") and in the log at start. A check that
 * cannot run never reads as zero faults.
 *
 * WHEN THE TAXONOMY CHANGED since the baseline (its sha256 is not the one in
 * catalogue/category-baseline.json) the check still runs, and `/api/health`
 * says `taxonomy: "changed since baseline"` with a log line.
 *
 * Nothing here is in price/src: the range ladder is read-only here, and its
 * safeguard sits in the app layer that calls it.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as settings from '../../settings/src/index.ts';
import { loadTaxonomy, parentRungFault, TaxonomyError } from '../../catalogue/src/category-taxonomy.ts';
import type { Taxonomy } from '../../catalogue/src/category-taxonomy.ts';

export type CategoryFaultKind = 'parent_not_ancestor';

/** Which answer part used the parent rung. */
export type RungVia = 'range' | 'verdict' | 'ring';

export interface RungUse {
  readonly via: RungVia;
  readonly barcode: string;
  /** The leaf the rung started from; null when the answer had none. */
  readonly leaf: string | null;
  /** The tag the answer used as the parent rung. */
  readonly parent: string | null;
}

export interface CategoryGuard {
  /** The fault kind, or null when the rung is sound or the check is off. Never throws. */
  check(use: RungUse): CategoryFaultKind | null;
  /** The taxonomy the guard loaded at start, for the range ladder's parent rung; null when it did not load (the check is then off). */
  taxonomy(): Taxonomy | null;
  /** The fields `/api/health` adds. */
  health(): CategoryHealth;
}

export interface CategoryHealth {
  /** "on", or exactly "category check off". */
  categoryCheck: 'on' | 'category check off';
  /** Why the check is off, when it is. */
  categoryCheckWhy?: string;
  /** Present and "changed since baseline" when the taxonomy file is not the baseline's. */
  taxonomy?: 'changed since baseline';
  /** Parent rungs checked since start (0 while off). */
  categoryChecked: number;
  /** Faults by kind since start. */
  categoryFaults: Record<string, number>;
}

/** Where serve-time faults are written for a person to see: <SHIN_DATA_DIR>/category-faults.json. */
export function defaultFaultsFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(settings.SHIN_DATA_DIR(env)?.trim() || join(process.cwd(), 'data'), 'category-faults.json');
}

/** One recorded fault. */
export interface FaultEntry {
  readonly kind: string;
  readonly barcode: string;
  readonly at: string;
}

/** The shape of category-faults.json: the running total, and the latest entries (capped). */
export interface FaultsFile {
  total: number;
  faults: FaultEntry[];
}

export const MAX_FAULT_ENTRIES = 1000;

/**
 * Append one fault to the file. Atomic (temp file, then rename). Never throws:
 * when it cannot write, that is said on the console, because a fault that cannot
 * reach the file must not vanish.
 */
export function appendFault(file: string, entry: FaultEntry): void {
  let cur: FaultsFile = { total: 0, faults: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as FaultsFile;
    if (typeof parsed.total === 'number' && Array.isArray(parsed.faults)) cur = parsed;
    else console.error(`[category-fault] ${file} has an unexpected shape; starting it again`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`[category-fault] ${file} is unreadable (${err instanceof Error ? err.message : String(err)}); starting it again`);
  }
  cur.total += 1;
  cur.faults.push(entry);
  if (cur.faults.length > MAX_FAULT_ENTRIES) cur.faults.splice(0, cur.faults.length - MAX_FAULT_ENTRIES);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.part`, JSON.stringify(cur));
    renameSync(`${file}.part`, file);
  } catch (err) {
    console.error(`[category-fault] could not record to ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface GuardOptions {
  readonly taxonomyPath: string;
  /** category-baseline.json; its taxonomy.sha256 is compared to the loaded file's. */
  readonly baselinePath?: string;
  /** Where lines go. Default console.error. */
  readonly log?: (line: string) => void;
  /** category-faults.json: every fault (kind, barcode, time) is appended here so a session start can show it. Absent: no file. */
  readonly faultsFile?: string;
}

function baselineSha(path: string): string | null {
  try {
    const b = JSON.parse(readFileSync(path, 'utf8')) as { taxonomy?: { sha256?: unknown } };
    return typeof b.taxonomy?.sha256 === 'string' ? b.taxonomy.sha256 : null;
  } catch (err) {
    console.error(`[category-fault] baseline_unreadable - ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function createCategoryGuard(opts: GuardOptions): CategoryGuard {
  const log = opts.log ?? ((l: string) => console.error(l));
  const emit = (kind: string, barcode: string, detail: string): void => {
    log(`[category-fault] ${kind} ${barcode}${detail}`);
    if (opts.faultsFile) appendFault(opts.faultsFile, { kind, barcode, at: new Date().toISOString() });
  };
  const faults: Record<string, number> = {};
  let checked = 0;
  let tax: Taxonomy | null = null;
  let why = '';
  let changed = false;

  try {
    tax = loadTaxonomy(opts.taxonomyPath);
  } catch (err) {
    why = err instanceof TaxonomyError ? err.message : `taxonomy failed to load: ${err instanceof Error ? err.message : String(err)}`;
    emit('taxonomy_unavailable', '-', ` category check off: ${why}`);
  }
  if (tax && opts.baselinePath) {
    const want = baselineSha(opts.baselinePath);
    if (want !== null && want !== tax.sha256) {
      changed = true;
      emit('taxonomy_changed', '-', ` sha256 ${tax.sha256} is not the baseline's ${want}`);
    }
  }

  return {
    taxonomy: () => tax,
    check(use) {
      if (!tax) return null;
      checked += 1;
      if (use.leaf === null || use.parent === null) return null;
      const kind = parentRungFault(use.leaf, use.parent, tax);
      if (kind) {
        faults[kind] = (faults[kind] ?? 0) + 1;
        emit(kind, use.barcode, '');
      }
      return kind;
    },
    health() {
      return {
        categoryCheck: tax ? 'on' : 'category check off',
        ...(tax ? {} : { categoryCheckWhy: why }),
        ...(changed ? { taxonomy: 'changed since baseline' as const } : {}),
        categoryChecked: checked,
        categoryFaults: { ...faults },
      };
    },
  };
}

/** The leaf and parent the range ladder and the verdict ladder read: the parent is the tag before the leaf. */
export function positionalParent(
  leafCategory: string | null,
  path: readonly string[],
): { leaf: string | null; parent: string | null } {
  const leaf = leafCategory ?? path[path.length - 1] ?? null;
  const idx = leaf ? path.lastIndexOf(leaf) : -1;
  return { leaf, parent: idx > 0 ? path[idx - 1]! : null };
}

/**
 * The leaf the ring was drawn from when it used a parent ring: the tag after the
 * ring's own tag in the stored path (the ring walk reads the leaf then the tag
 * before it). Null when the ring tag is not in the path.
 */
export function ringLeaf(path: readonly string[], ringTag: string): string | null {
  const want = ringTag.toLowerCase();
  for (let i = path.length - 2; i >= 0; i--) {
    if (path[i]!.toLowerCase() === want) return path[i + 1]!;
  }
  return null;
}
