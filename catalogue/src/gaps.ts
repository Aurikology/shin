/**
 * The miss log: a standalone SQLite file that records what the catalogue
 * could not answer, so a person can decide what to add next.
 *
 * Decision 30 says a miss is a finding, not a dead end. `search.ts` used to
 * act on that by inserting into `catalogue_gap`, a table living inside the
 * catalogue database itself, and every one of those inserts failed: the
 * serving connection is opened read-only on purpose (`openCatalogueReadOnly`
 * in schema.ts) because a serving process that can write can also corrupt,
 * and one that migrates on boot will do it during a restart under load. The
 * write was caught, counted into a field nothing read, and thrown away. The
 * gap table has held 0 rows since the day it was created.
 *
 * The fix is not a permission change on that connection; it is a second,
 * tiny, separate database that only this file touches. It is opened
 * read-write always, because nothing else ever opens it, so there is no
 * corruption risk to trade against and no migration-under-load hazard to
 * guard.
 *
 * Rolled up, not one row per event: a hundred searches for the same missing
 * product is one finding with a count of 100, not a hundred rows for a
 * person to read. A miss is identified by its barcode when it has one
 * (digits only, so "0123" and "123" are the same product's miss), otherwise
 * by its trimmed, lower-cased query text (so "Ovaltine" and "ovaltine" are
 * the same finding; a person deciding what to add does not want those
 * split).
 *
 * `recordGap` must never throw. That is the entire bug being fixed: a failed
 * miss-log write used to turn a clean "we don't have this" into an error
 * message on a user's screen. Every failure here, including the log never
 * having opened at all, is swallowed and counted instead.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createUserCatalogue, recordUserScan, type UserCatalogue, type UserScanInput } from './user-catalogue.ts';

const DDL = `
CREATE TABLE IF NOT EXISTS gap (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,
  key         TEXT NOT NULL,
  gtin        TEXT,
  query_text  TEXT,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 1,
  note        TEXT,
  UNIQUE(kind, key)
) STRICT;

CREATE INDEX IF NOT EXISTS gap_count ON gap(count DESC);
`;

/**
 * A handle on the miss log.
 *
 * `db` is null when the file could not be opened or migrated (a directory
 * that cannot be created, a read-only location, a locked file). A null `db`
 * is not an error thrown at the caller; it is a fact `recordGap` checks and
 * counts against, the same way a failed insert is.
 */
export interface GapLog {
  readonly path: string;
  readonly db: DatabaseSync | null;
  /** Misses that could not be written down since this handle was opened. */
  dropped: number;
  /** Why the last drop happened. Empty string when nothing has dropped. */
  droppedWhy: string;
}

/**
 * The log every `recordGap` call writes to until `openGapLog` is called
 * again. Lazily opened at the default path on first use, so wiring this
 * into the search path is one call with no setup: import `recordGap` and
 * call it. Tests, and anything that wants its own file, call `openGapLog`
 * first to point it elsewhere.
 */
let active: GapLog | null = null;

/**
 * The log `recordGap` is currently writing to, or null if nothing has opened
 * one yet. Exists so a caller can keep reporting how many misses were lost
 * without owning the handle. Without it, a caller that used to count its own
 * failed writes has nothing to count once the writing moved in here, and a
 * counter that can only ever read zero is worse than no counter: it reads as
 * an assurance that nothing is being lost, from code no longer able to notice.
 */
export function activeGapLog(): GapLog | null {
  return active;
}

/**
 * Opens (creating if needed) the standalone miss-log database and makes it
 * the target of future `recordGap` calls.
 *
 * Never throws. A path that cannot be created or opened comes back as a
 * `GapLog` with `db: null` and `droppedWhy` set, so a caller that only
 * calls `recordGap` afterward never sees an exception either.
 */
export function openGapLog(path: string = process.env.SHIN_GAPS ?? 'data/gaps.db'): GapLog {
  let db: DatabaseSync | null = null;
  let droppedWhy = '';
  try {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(DDL);
  } catch (err) {
    db = null;
    droppedWhy = err instanceof Error ? err.message : String(err);
  }
  const log: GapLog = { path, db, dropped: 0, droppedWhy };
  active = log;
  return log;
}

/**
 * Digits only, leading zeros dropped, so "060383888885", "0060383888885" and
 * "60383888885" all key to the same miss: a UPC-A read and its zero-padded
 * EAN-13 form are the same product, and search.ts's own barcode lookup
 * already treats them as such (see byGtin's padStart/strip forms).
 */
function normalizeGtin(gtin: string): string {
  const digits = gtin.replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits || gtin.trim();
}

interface GapKey {
  readonly kind: 'gtin' | 'text';
  readonly key: string;
  readonly gtin: string | null;
  readonly queryText: string | null;
}

/** Barcode identifies a miss when there is one; text identifies it otherwise. */
function classify(input: { gtin?: string; queryText?: string }): GapKey {
  const gtin = input.gtin?.trim();
  if (gtin) {
    return {
      kind: 'gtin',
      key: normalizeGtin(gtin),
      gtin,
      queryText: input.queryText?.trim() || null,
    };
  }
  const text = input.queryText?.trim() ?? '';
  return { kind: 'text', key: text.toLowerCase(), gtin: null, queryText: text || null };
}

/**
 * ITEM 15. The human-review log above is kept, and a miss now ALSO creates a
 * catalogue entry, marked user-sourced and untrusted, where the user catalogue
 * (user-catalogue.ts) groups it with near-duplicates and holds it per store type.
 * Jamin: "if a product doesn't exist in our catalogue then a user scan will add a
 * new item to the catalogue ... taken with a grain of salt and not fully trusted".
 *
 * The user catalogue is a sibling file of the gap log (`user-catalogue.db` beside
 * `gaps.db`), so a test or a deployment that points the gap log somewhere gets
 * the entries there too and never writes into the default location by accident.
 * `SHIN_USER_CATALOGUE` overrides it.
 *
 * A typed query too short to be a product name (under three characters) and no
 * barcode is not an entry: it is a keystroke, and stays in the review log only.
 */
const userCatalogues = new WeakMap<GapLog, UserCatalogue>();

function userCatalogueFor(log: GapLog): UserCatalogue {
  let uc = userCatalogues.get(log);
  if (!uc) {
    const path = process.env.SHIN_USER_CATALOGUE
      ?? (log.path === ':memory:' ? ':memory:' : join(dirname(log.path), 'user-catalogue.db'));
    uc = createUserCatalogue(path);
    userCatalogues.set(log, uc);
  }
  return uc;
}

function autoCreateFromMiss(log: GapLog, input: { gtin?: string; queryText?: string; scan?: UserScanInput }): void {
  const gtin = input.scan?.gtin ?? input.gtin;
  const name = input.scan?.name ?? input.queryText;
  const hasName = (name?.trim().length ?? 0) >= 3;
  if (!gtin?.trim() && !hasName) return;
  recordUserScan(
    { ...input.scan, gtin, name: hasName ? name : null, bare: input.scan?.name ? false : true },
    { log: userCatalogueFor(log), probe: null },
  );
}

/**
 * Records one miss, rolling it into an existing finding when the same
 * barcode or text has been seen before.
 *
 * Never throws. A search that found nothing must still answer cleanly; a
 * search that found nothing AND failed to write that down must answer just
 * as cleanly. Every failure path here, including no log ever having opened,
 * lands in the same catch and is counted rather than raised.
 */
export function recordGap(input: {
  gtin?: string;
  queryText?: string;
  note?: string;
  /**
   * Item 15. What the scan that missed knows about the product (Gemini's answer,
   * the typed price, the store). When present it fills the new user-sourced entry;
   * when absent the entry is built from the barcode or the query text alone and is
   * marked bare.
   */
  scan?: UserScanInput;
}): void {
  const log = active ?? openGapLog();
  try {
    autoCreateFromMiss(log, input);
  } catch {
    // Item 15's entry is on top of the log and never instead of it or a reason it fails.
  }
  try {
    if (!log.db) throw new Error(log.droppedWhy || 'gap log is not open');
    const { kind, key, gtin, queryText } = classify(input);
    const now = new Date().toISOString();
    log.db
      .prepare(
        `INSERT INTO gap (kind, key, gtin, query_text, first_seen, last_seen, count, note)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(kind, key) DO UPDATE SET
           count = count + 1,
           last_seen = excluded.last_seen,
           note = COALESCE(excluded.note, note)`,
      )
      .run(kind, key, gtin, queryText, now, now, input.note?.trim() || null);
  } catch (err) {
    log.dropped += 1;
    log.droppedWhy = err instanceof Error ? err.message : String(err);
  }
}
