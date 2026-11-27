/**
 * The US names index: barcode -> product name for Open Food Facts products sold in the United
 * States that the Canada catalogue does not hold. Built offline by catalogue/src/fetch_us_names.py
 * (its header has the build command and the file layout).
 *
 * WHY. RULINGS.md "A scan never ends with no result" (2026-10-10): a barcode the catalogue misses is
 * named elsewhere before "not found" is said. The live Open Food Facts lookup is held to 12 calls a
 * minute for the whole server (open-food-facts.ts; OFF publishes 15 a minute per IP), so a popular
 * US product scanned during a busy minute used to fall through to "not in catalogue". This file is
 * read first, costs no network call, and a hit is treated exactly like a live Open Food Facts name
 * (`server.ts` `nameElsewhereFor`: same fields, same `open_food_facts` source, same price ladder after).
 *
 * MISSING FILE IS NOT AN ERROR. The server boots and answers with no index: it is logged once, the
 * lookup answers null, and the live Open Food Facts call runs as before. The file is looked for again
 * every few minutes, so one copied in while the server runs is picked up without a restart.
 *
 * The file is opened read-only and never written. A query that throws is logged once and answers null.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as settings from '../../settings/src/index.ts';

export interface UsNameHit {
  /** The barcode as Open Food Facts spells it. */
  readonly code: string;
  readonly name: string;
  /** The first brand Open Food Facts lists. */
  readonly brand: string | null;
  /** Open Food Facts' `quantity` text, e.g. "1 L". */
  readonly size: string | null;
  /** Up to three Open Food Facts category tags, most specific first. Stored for later use; no caller reads them yet. */
  readonly categories: readonly string[];
}

const RECHECK_MS = 5 * 60_000;

/**
 * The numeric spelling of a barcode: digits only, leading zeros removed. The builder writes its `key`
 * column the same way (fetch_us_names.py `index_key`), so every zero-padded spelling of one code,
 * UPC-A, EAN-13, EAN-8, GTIN-14, finds one row. Null for anything that is not 6 to 14 digits.
 */
export function indexKey(code: string): string | null {
  const digits = code.trim();
  if (!/^\d{6,14}$/.test(digits)) return null;
  const key = digits.replace(/^0+/, '');
  return key === '' ? null : key;
}

let override: string | null = null;
let db: DatabaseSync | null = null;
let openedPath: string | null = null;
let nextOpenAttemptAt = 0;
const warned = new Set<string>();

function warnOnce(kind: string, message: string): void {
  if (warned.has(kind)) return;
  warned.add(kind);
  console.warn(`US names index: ${message}`);
}

function indexPath(): string {
  if (override !== null) return override;
  return settings.SHIN_US_NAMES_INDEX() ?? fileURLToPath(new URL('../../catalogue/data/us-names.db', import.meta.url));
}

function handle(): DatabaseSync | null {
  const path = indexPath();
  if (db && openedPath === path) return db;
  if (db) {
    try {
      db.close();
    } catch {
      /* closing a handle that is already gone */
    }
    db = null;
  }
  const now = Date.now();
  if (now < nextOpenAttemptAt) return null;
  nextOpenAttemptAt = now + RECHECK_MS;
  if (!existsSync(path)) {
    warnOnce('missing', `no file at ${path}; US barcodes are named by the live Open Food Facts lookup only (build it with catalogue/src/fetch_us_names.py)`);
    return null;
  }
  try {
    db = new DatabaseSync(path, { readOnly: true });
    openedPath = path;
    return db;
  } catch (err) {
    warnOnce('open', `could not open ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** The name the US index holds for this barcode, or null (not held, no index file, or a failed read). */
export function lookupUsName(gtin: string): UsNameHit | null {
  const key = indexKey(gtin);
  if (!key) return null;
  const conn = handle();
  if (!conn) return null;
  try {
    const row = conn.prepare('SELECT code, name, brand, quantity, categories FROM us_name WHERE key = ?').get(key) as
      | { code: string; name: string; brand: string | null; quantity: string | null; categories: string | null }
      | undefined;
    if (!row || !row.name.trim()) return null;
    return {
      code: row.code,
      name: row.name.trim(),
      brand: row.brand?.trim() || null,
      size: row.quantity?.trim() || null,
      categories: row.categories ? row.categories.split(',') : [],
    };
  } catch (err) {
    warnOnce('query', `lookup failed (${err instanceof Error ? err.message : String(err)}); falling through to Open Food Facts`);
    return null;
  }
}

/** Tests: point the index at a fixture file, or `null` for "use the configured path" again. Resets the once-only log and the open handle. */
export function setUsNamesIndexForTests(path: string | null): void {
  override = path;
  warned.clear();
  nextOpenAttemptAt = 0;
  if (db) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    db = null;
    openedPath = null;
  }
}

/** Tests: whether a once-only log line has fired. */
export function usNamesIndexWarnedForTests(kind: string): boolean {
  return warned.has(kind);
}
