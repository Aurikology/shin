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

import * as settings from '../../settings/src/index.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createUserCatalogue, hasUserEntry, recordUserScan, type UserCatalogue, type UserScanInput } from './user-catalogue.ts';

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
 * WHY `catalogue_missing` IS A COLUMN AND NOT A NOTE, added 2026-09-26.
 *
 * `note` cannot carry this fact, and that was proved in the running app rather
 * than argued. Two writers land on the same barcode inside one scan: the
 * catalogue check in server.ts, which means "we do not hold this", and the
 * Gemini path, which means "the model could not name it". The upsert below ends
 * `note = COALESCE(excluded.note, note)`, so whichever writes SECOND owns the
 * field, and the Gemini path always writes second. A live scan of a genuinely
 * absent barcode came back holding `gemini_miss:model_client_error` with a count
 * of 2: both writes had landed, and the one fact a catalogue decision needs had
 * been overwritten by the one it must be told apart from.
 *
 * A column fixes it in a way that does not depend on write order. It is raised
 * with `max(...)`, never cleared, so a later writer that knows nothing about the
 * catalogue cannot erase what the catalogue already answered. The consumer's
 * question becomes one count that cannot be confused with a model failure:
 * `SELECT count(*) FROM gap WHERE catalogue_missing = 1`.
 *
 * Added by migration rather than only in the DDL because three of these files
 * already exist on this machine, holding 102 misses between them.
 */
const MIGRATIONS: ReadonlyArray<{ column: string; ddl: string }> = [
  {
    column: 'catalogue_missing',
    ddl: 'ALTER TABLE gap ADD COLUMN catalogue_missing INTEGER NOT NULL DEFAULT 0',
  },
];

/**
 * Adds any column the DDL above gained after files were already in the field.
 * Additive only: no column is renamed, retyped or dropped, so an older reader
 * of the same file keeps working. A failure here is swallowed like every other
 * failure in this file; the caller's answer to a user never depends on it.
 */
function migrate(db: DatabaseSync): void {
  const have = new Set(
    (db.prepare('SELECT name FROM pragma_table_info(?)').all('gap') as Array<{ name: string }>).map((r) => r.name),
  );
  for (const m of MIGRATIONS) if (!have.has(m.column)) db.exec(m.ddl);
}

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
  /**
   * Requirement 5.7's "count in": every miss offered to `recordGap` on this handle, per finding,
   * with the stored count read BEFORE the first write so history from earlier runs is not blamed.
   * Bounded by MAX_LEDGER findings; past it `ledgerOverflow` counts what was not tracked, and
   * `reconcileGaps` says so rather than pretending it checked.
   */
  readonly ledger: Map<string, LedgerEntry>;
  ledgerOverflow: number;
}

/** The most distinct findings one handle tracks for reconciliation. A bound, not a judgement. */
const MAX_LEDGER = 20000;

interface LedgerEntry {
  readonly kind: 'gtin' | 'text';
  readonly key: string;
  readonly gtin: string | null;
  readonly text: string | null;
  /** Misses offered for this finding on this handle. */
  offered: number;
  /** Stored count before this handle's first write; null until read. */
  baseline: number | null;
  /** Pending-item attempts, and what they were looking for when read back. */
  pendingOffered: number;
  pendingGtin: string | null;
  pendingName: string | null;
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
export function openGapLog(path: string = settings.SHIN_GAPS() ?? 'data/gaps.db'): GapLog {
  let db: DatabaseSync | null = null;
  let droppedWhy = '';
  try {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path);
    // Added 2026-09-19 alongside item 14 (server.ts's Gemini-path miss now
    // calls recordGap too, on top of the catalogue-search misses this log
    // already took): many more writers can now land on this file inside one
    // test run, and without a busy timeout a second writer arriving while
    // another is mid-write gets SQLITE_BUSY immediately instead of a short
    // wait. Same value repeat-cache.ts (item 1) uses for the same reason.
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(DDL);
    migrate(db);
  } catch (err) {
    db = null;
    droppedWhy = err instanceof Error ? err.message : String(err);
  }
  const log: GapLog = { path, db, dropped: 0, droppedWhy, ledger: new Map(), ledgerOverflow: 0 };
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
 * No minimum length (changed 2026-10-09, requirement 5.7): a two-letter typed name that
 * missed is a pending item with its raw text, like any other.
 */
const userCatalogues = new WeakMap<GapLog, UserCatalogue>();

function userCatalogueFor(log: GapLog): UserCatalogue {
  let uc = userCatalogues.get(log);
  if (!uc) {
    const path = settings.SHIN_USER_CATALOGUE()
      ?? (log.path === ':memory:' ? ':memory:' : join(dirname(log.path), 'user-catalogue.db'));
    uc = createUserCatalogue(path);
    userCatalogues.set(log, uc);
  }
  return uc;
}

function autoCreateFromMiss(
  log: GapLog,
  input: { gtin?: string; queryText?: string; scan?: UserScanInput },
): { gtin: string | null; name: string | null } {
  const gtin = input.scan?.gtin ?? input.gtin;
  const name = input.scan?.name ?? input.queryText;
  // Requirement 5.7, 2026-10-09: no minimum length. The old "under three characters is a keystroke"
  // rule was a code comment (item 15), not a ruling, and it dropped real two-letter names. Typeahead
  // noise is stopped where it starts, by the caller passing `recordMiss: false`, not by losing the text.
  const hasName = (name?.trim().length ?? 0) >= 1;
  if (!gtin?.trim() && !hasName) return { gtin: null, name: null };
  const result = recordUserScan(
    { ...input.scan, gtin, name: hasName ? name : null, bare: input.scan?.name ? false : true },
    { log: userCatalogueFor(log), probe: null },
  );
  if (result.outcome === 'dropped') {
    console.warn(`[catalogue-fault] pending_item_dropped a miss could not become a pending item: ${result.reason ?? 'unknown'}`);
  }
  return { gtin: gtin?.trim() || null, name: hasName ? name!.trim() : null };
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
   * True only when the catalogue was actually consulted and did not hold this
   * barcode. Left absent by every other caller, which is why it is raised with
   * `max` and never cleared: a Gemini-path write on the same barcode says
   * nothing about the catalogue and must not be able to unset it. Absent is not
   * "we have it"; it is "nobody looked", and the two must stay distinguishable
   * or every count taken from this log is wrong.
   */
  catalogueMissing?: boolean;
  /**
   * Item 15. What the scan that missed knows about the product (Gemini's answer,
   * the typed price, the store). When present it fills the new user-sourced entry;
   * when absent the entry is built from the barcode or the query text alone and is
   * marked bare.
   */
  scan?: UserScanInput;
}): void {
  const log = active ?? openGapLog();
  // Counted in before anything can fail, so a miss that is lost is lost against a count.
  const { kind, key, gtin, queryText } = classify(input);
  const ledgerKey = `${kind}\u0000${key}`;
  let entry = log.ledger.get(ledgerKey);
  if (!entry && log.ledger.size < MAX_LEDGER) {
    entry = { kind, key, gtin, text: queryText, offered: 0, baseline: null, pendingOffered: 0, pendingGtin: null, pendingName: null };
    log.ledger.set(ledgerKey, entry);
  } else if (!entry) {
    log.ledgerOverflow += 1;
  }
  if (entry) {
    entry.offered += 1;
    if (entry.baseline === null) {
      try {
        const r = log.db?.prepare('SELECT count FROM gap WHERE kind = ? AND key = ?').get(kind, key) as { count: number } | undefined;
        entry.baseline = r?.count ?? 0;
      } catch (err) {
        console.warn(`[catalogue-fault] gap_baseline_unreadable ${err instanceof Error ? err.message : String(err)}`);
        entry.baseline = 0;
      }
    }
  }
  try {
    const wanted = autoCreateFromMiss(log, input);
    if (entry && (wanted.gtin !== null || wanted.name !== null)) {
      entry.pendingOffered += 1;
      // Written once: what to look for when the pending table is read back.
      entry.pendingGtin ??= wanted.gtin;
      entry.pendingName ??= wanted.name;
    }
  } catch (err) {
    // Item 15's entry is on top of the log and never instead of it or a reason it fails, and it is
    // never silent either (2026-10-08, "Errors never go unnoticed").
    console.warn(`[catalogue-fault] pending_item_dropped ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    if (!log.db) throw new Error(log.droppedWhy || 'gap log is not open');
    const now = new Date().toISOString();
    log.db
      .prepare(
        `INSERT INTO gap (kind, key, gtin, query_text, first_seen, last_seen, count, note, catalogue_missing)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(kind, key) DO UPDATE SET
           count = count + 1,
           last_seen = excluded.last_seen,
           query_text = COALESCE(gap.query_text, excluded.query_text),
           note = COALESCE(excluded.note, note),
           catalogue_missing = max(gap.catalogue_missing, excluded.catalogue_missing)`,
      )
      .run(
        kind,
        key,
        gtin,
        queryText,
        now,
        now,
        input.note?.trim() || null,
        input.catalogueMissing ? 1 : 0,
      );
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    // Said out loud, once per distinct reason: a broken log would otherwise print a line for
    // every miss. The count keeps rising, and /api/health shows it with the reason.
    const fresh = log.dropped === 0 || why !== log.droppedWhy;
    log.dropped += 1;
    log.droppedWhy = why;
    if (fresh) console.warn(`[catalogue-fault] gap_dropped a miss could not be written to ${log.path}: ${why}`);
  }
}

/* ------------------------------------------------- 5.7: count in against stored */

export interface GapReconciliation {
  readonly ok: boolean;
  /** Misses offered to `recordGap` on this handle. */
  readonly offered: number;
  /** Of those, how many the gap table holds when read back (growth past its pre-handle count, never more than offered). */
  readonly stored: number;
  readonly pendingOffered: number;
  readonly pendingStored: number;
  /** Findings whose stored count fell short, up to MAX_EXAMPLES. */
  readonly lost: ReadonlyArray<{ kind: string; text: string | null; gtin: string | null; offered: number; stored: number }>;
  /** Text findings stored without their raw text, or barcode findings without the barcode. */
  readonly rawTextMissing: ReadonlyArray<{ kind: string; key: string; offeredText: string | null }>;
  /** Findings with no pending item when the user catalogue was read back. */
  readonly pendingLost: ReadonlyArray<{ gtin: string | null; name: string | null }>;
  /** Findings past the ledger bound that could not be checked. A non-zero value fails the check. */
  readonly untracked: number;
  /** `recordGap` writes that threw on this handle. */
  readonly dropped: number;
}

const MAX_EXAMPLES = 5;

/**
 * Requirement 5.7's check, "count in against stored": the misses offered to `recordGap` on this
 * handle against what the gap table and the pending-item table hold when READ BACK. Never
 * throws; returns the counts and examples, and `ok` is false on any shortfall, any missing raw
 * text, any missing pending item, any miss past the ledger bound, or any write that threw.
 * Rows beyond the offered count (another process writing the same file) are not a failure.
 */
export function reconcileGaps(log: GapLog | null = active): GapReconciliation {
  if (!log) {
    return { ok: true, offered: 0, stored: 0, pendingOffered: 0, pendingStored: 0, lost: [], rawTextMissing: [], pendingLost: [], untracked: 0, dropped: 0 };
  }
  let offered = 0;
  let stored = 0;
  let pendingOffered = 0;
  let pendingStored = 0;
  const lost: Array<GapReconciliation['lost'][number]> = [];
  const rawTextMissing: Array<GapReconciliation['rawTextMissing'][number]> = [];
  const pendingLost: Array<GapReconciliation['pendingLost'][number]> = [];
  let lostTotal = 0;
  let rawTotal = 0;
  let pendingLostTotal = 0;
  const uc = log.ledger.size > 0 ? userCatalogueFor(log) : null;
  for (const e of log.ledger.values()) {
    offered += e.offered;
    let row: { count: number; query_text: string | null; gtin: string | null } | undefined;
    if (log.db) {
      row = log.db.prepare('SELECT count, query_text, gtin FROM gap WHERE kind = ? AND key = ?').get(e.kind, e.key) as typeof row;
    }
    const grew = Math.max(0, (row?.count ?? 0) - (e.baseline ?? 0));
    const kept = Math.min(e.offered, grew);
    stored += kept;
    if (kept < e.offered) {
      lostTotal += 1;
      if (lost.length < MAX_EXAMPLES) lost.push({ kind: e.kind, text: e.text, gtin: e.gtin, offered: e.offered, stored: kept });
    }
    if (row) {
      const missing = e.kind === 'gtin' ? !row.gtin : e.text !== null && !row.query_text;
      if (missing) {
        rawTotal += 1;
        if (rawTextMissing.length < MAX_EXAMPLES) rawTextMissing.push({ kind: e.kind, key: e.key, offeredText: e.text });
      }
    }
    if (e.pendingOffered > 0) {
      pendingOffered += e.pendingOffered;
      if (uc && hasUserEntry(uc, { gtin: e.pendingGtin, name: e.pendingName })) {
        pendingStored += e.pendingOffered;
      } else {
        pendingLostTotal += 1;
        if (pendingLost.length < MAX_EXAMPLES) pendingLost.push({ gtin: e.pendingGtin, name: e.pendingName });
      }
    }
  }
  const ok = lostTotal === 0 && rawTotal === 0 && pendingLostTotal === 0 && log.ledgerOverflow === 0 && log.dropped === 0;
  return { ok, offered, stored, pendingOffered, pendingStored, lost, rawTextMissing, pendingLost, untracked: log.ledgerOverflow, dropped: log.dropped };
}

/**
 * Throws, with counts and examples, when `reconcileGaps` is not ok. For a test, a health check,
 * or a job end: "Errors never go unnoticed" means a lost miss is a failure someone sees, not a
 * number in a field nothing reads.
 */
export function assertGapsReconciled(log: GapLog | null = active): GapReconciliation {
  const r = reconcileGaps(log);
  if (r.ok) return r;
  const eg = (xs: ReadonlyArray<unknown>) => JSON.stringify(xs);
  throw new Error(
    `[catalogue-fault] gap_reconcile_failed misses offered ${r.offered}, stored ${r.stored}; ` +
      `pending items offered ${r.pendingOffered}, stored ${r.pendingStored}; write errors ${r.dropped}; untracked ${r.untracked}. ` +
      `lost: ${eg(r.lost)} raw text missing: ${eg(r.rawTextMissing)} pending missing: ${eg(r.pendingLost)}`,
  );
}
