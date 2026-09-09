/**
 * The scan log: one row per scan, recorded so four different consumers can
 * each read it their own way without a fifth thing having to reconcile them.
 * The four are named in the brief, not built here: the free-tier meter (how
 * many scans this device gets this week), the crawler's priority queue (what
 * to fetch next), per-person routing priors (which lookup path tends to
 * answer this device's scans), and a shared answer cache (do not re-look-up
 * what a recent scan already resolved). None of those four are wired to
 * this file; this file only has to give each of them something true to read.
 *
 * Follows catalogue/src/gaps.ts's shape on purpose: a standalone SQLite file
 * nothing else opens, opened read-write lazily on first use, created if
 * missing, and never throwing. A meter, a queue, a prior and a cache all
 * read this table; none of the four should ever fail because a phone's
 * camera loop threw while trying to write down what it just saw. Every
 * failure here, including the store never having opened at all, is
 * swallowed and counted in `dropped`/`droppedWhy`, the same contract
 * gaps.ts already proved out.
 *
 * PRIVACY: this table holds no name, no email, no location and no device
 * fingerprint. The only identifying field is `device_id`, a random UUID the
 * phone itself generates on first run (see public/js/device.js) and sends
 * back unchanged after that. It identifies a device's local storage, never
 * a person; nothing in this file, or in device.js, derives it from anything
 * about the device's hardware or the person using it, and nothing here ever
 * asks for a name, an email, or a sign-up to get one.
 *
 * THE COUNTING RULE lives in `weeklyCount`, not in `recordScan`: every scan
 * is written down (a refusal and a correction are both findings worth
 * keeping for the four consumers above), but only an outcome of 'answered'
 * is ours to charge against a person's free tier. A scan we refused to
 * answer is our failure, not a used turn. A scan a person corrected is a
 * scan we got wrong, so it is not metered either, the moment it is marked
 * corrected. `weeklyCount` is the one place that reads `outcome = 'answered'`
 * and nowhere else encodes the rule, so there is exactly one place to check
 * it and exactly one place that could get it wrong.
 */

/*
 * ON `scan.category`, which is declared in the DDL below with a one-line note.
 *
 * (This comment sits outside the template literal deliberately, the same way
 * catalogue/src/schema.ts's does and for the same reason: the backticks this
 * paragraph needs around file names would close the literal early. That file
 * learned it as six unrelated-looking syntax errors; this one learned it as
 * two.)
 *
 * It holds which of the five kinds the app decided a scan was, at the moment
 * it was scanned, or NULL when it would not name one.
 *
 * STORED RATHER THAN DERIVED, and that is the point of the column. The verdict
 * comes from `app/src/category-map.ts` reading the product's own tags, so
 * re-deriving it later needs the catalogue attached, which is exactly what a
 * phone in an aisle does not have. It is also a record of what we thought
 * THEN, which is the only honest thing to build a prior about a person from.
 *
 * NOT A CLAIM ABOUT THE PRODUCT, and nothing may read it as one. Its only
 * consumer is `catalogue/src/routing.ts`, whose header carries the rule this
 * column has to obey: a route guesses about the PERSON and never about the
 * PRODUCT. A prior that decided the product would tell somebody holding a
 * laptop it is groceries because that is what they usually buy.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DDL = `
CREATE TABLE IF NOT EXISTS scan (
  id             INTEGER PRIMARY KEY,
  device_id      TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('barcode', 'text', 'photo')),
  query_text     TEXT,
  resolved_code  TEXT,
  resolved_label TEXT,
  confidence     REAL,
  source         TEXT,
  outcome        TEXT NOT NULL CHECK (outcome IN ('answered', 'refused', 'corrected')),
  corrected_code TEXT,
  scanned_at     TEXT NOT NULL,
  -- The five-kind verdict at scan time, or NULL. See the note below the DDL.
  category       TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS scan_device_week ON scan(device_id, outcome, scanned_at);
-- The two indexes below cover the queries that actually run on every request.
-- scan_device_week above covers weeklyCount exactly, and weeklyCount has no
-- production caller. recentCategories runs on every identify and search and
-- filters on category and an INEQUALITY on outcome, so the index above stops
-- at the device_id prefix and the rest is a scan-and-sort of every row that
-- device has, on the request thread, growing without bound for the repeat
-- shopper this product is built for. lastAnsweredScan runs on every
-- correction. Both want newest-first by id under a device. Indexes, unlike
-- columns, are created by IF NOT EXISTS on a table that already exists.
CREATE INDEX IF NOT EXISTS scan_device_recent ON scan(device_id, id DESC);
CREATE INDEX IF NOT EXISTS scan_device_code ON scan(device_id, resolved_code, id DESC);
`;

/**
 * A handle on the scan log.
 *
 * `db` is null when the file could not be opened or migrated (a directory
 * that cannot be created, a read-only location, a locked file). A null `db`
 * is not an error thrown at the caller; it is a fact `recordScan`,
 * `correctScan` and `weeklyCount` all check and count against, the same way
 * a failed insert is.
 */
export interface ScanStore {
  readonly path: string;
  readonly db: DatabaseSync | null;
  /** Writes or reads that could not complete since this handle was opened. */
  dropped: number;
  /** Why the last drop happened. Empty string when nothing has dropped. */
  droppedWhy: string;
}

/**
 * The store every `recordScan` / `correctScan` / `weeklyCount` call uses
 * until `openScanStore` is called again. Lazily opened at the default path
 * on first use. Tests, and anything that wants its own file, call
 * `openScanStore` first to point it elsewhere.
 */
let active: ScanStore | null = null;

/** The store currently in use, or null if nothing has opened one yet. */
export function activeScanStore(): ScanStore | null {
  return active;
}

/**
 * Opens (creating if needed) the standalone scan-log database and makes it
 * the target of future calls.
 *
 * Never throws. A path that cannot be created or opened comes back as a
 * `ScanStore` with `db: null` and `droppedWhy` set, so a caller that only
 * calls `recordScan` afterward never sees an exception either.
 */
export function openScanStore(path: string = process.env.SHIN_SCANS ?? 'data/scans.db'): ScanStore {
  let db: DatabaseSync | null = null;
  let droppedWhy = '';
  try {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path);
    /*
     * WAIT FOR A WRITE LOCK RATHER THAN GIVING UP ON ONE.
     *
     * Opening this file runs DDL, and DDL takes the write lock. More than one
     * process opens it -- the server, `npm run what-to-price`, and this repo's
     * concurrent sessions -- so two opens can collide on it. Measured on
     * 2026-09-08 with ten processes opening one unmigrated file at once: one
     * of the ten failed with `database is locked`.
     *
     * The cost of that failure is out of all proportion to its cause. The
     * throw lands in the catch below, which nulls the handle, and a null
     * handle is permanent for the life of the process: every scan becomes a
     * counted drop, `recentCategories` returns empty so every search silently
     * stops being routed, and the profile screen reports zeroes. All of it
     * from losing a race by a few milliseconds.
     *
     * Five seconds is far longer than any statement here takes and far shorter
     * than a person waits for a scan. It is a busy timeout, not a retry loop:
     * SQLite blocks the one statement that needs the lock and gives it up the
     * moment the other writer commits.
     */
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(DDL);
    /*
     * `CREATE TABLE IF NOT EXISTS` does nothing to a table that already
     * exists, so a column added after the first release has to be added by
     * hand or every database in the field is silently one column short. This
     * reads what is actually there rather than tracking a version number,
     * which cannot be wrong about the file in front of it.
     *
     * Additive and nullable on purpose: rows written before the column existed
     * keep a NULL category, which `recentCategories` skips. An old log makes
     * the route unsure, never wrong.
     */
    const columns = db.prepare('PRAGMA table_info(scan)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'category')) {
      /*
       * THE ALTER GETS ITS OWN CATCH, BECAUSE THE READ ABOVE IT AND THE WRITE
       * HERE ARE NOT ONE OPERATION.
       *
       * Two processes opening this file at once -- the server and
       * `npm run what-to-price`, or two of this repo's concurrent sessions --
       * can both read a table with no `category` and both try to add it. The
       * loser gets `duplicate column name: category`.
       *
       * Without this catch that throw escapes into the open above, which sets
       * `db = null` and turns the whole scan log off for the life of the
       * process: every write becomes a counted drop, `recentCategories`
       * returns empty so every route falls back to searching everything, and
       * the profile screen reports zeroes. All of it silent, and all of it
       * from losing a race that changed nothing, because the column the loser
       * wanted is now there.
       *
       * So a duplicate column is success arriving from somebody else. Anything
       * else is rethrown and does null the handle, which is correct: a table
       * that cannot take the column is not a scan log this code can use.
       */
      try {
        db.exec('ALTER TABLE scan ADD COLUMN category TEXT');
      } catch (err) {
        /*
         * The question is not which error this was, it is whether the column
         * is there now. `duplicate column name` means somebody else added it
         * and this process is fine; a lock that outlasted the busy timeout
         * means it is not there and this handle cannot be trusted. Reading the
         * table back answers both without matching on message text, which is
         * the part that would rot the day the driver rewords itself.
         */
        const again = db.prepare('PRAGMA table_info(scan)').all() as { name: string }[];
        if (!again.some((c) => c.name === 'category')) throw err;
      }
    }
  } catch (err) {
    db = null;
    droppedWhy = err instanceof Error ? err.message : String(err);
  }
  const store: ScanStore = { path, db, dropped: 0, droppedWhy };
  active = store;
  return store;
}

export type ScanKind = 'barcode' | 'text' | 'photo';
export type ScanOutcome = 'answered' | 'refused' | 'corrected';

export interface ScanInput {
  readonly deviceId: string;
  readonly kind: ScanKind;
  /** The query as asked: the barcode digits, the typed text, or the photo's caption/label. */
  readonly query: string;
  readonly resolvedCode?: string | null;
  readonly resolvedLabel?: string | null;
  readonly confidence?: number | null;
  readonly source?: string | null;
  /** The five-kind verdict at scan time, or null when the app would not name one. */
  readonly category?: string | null;
  readonly outcome: ScanOutcome;
  /**
   * Overrides the recorded timestamp. Tests use this to place a row in a
   * specific week without mocking the clock; real callers should omit it
   * and get `new Date().toISOString()`.
   */
  readonly scannedAt?: string;
}

interface ScanRow {
  id: number;
  device_id: string;
  kind: string;
  query_text: string | null;
  resolved_code: string | null;
  resolved_label: string | null;
  confidence: number | null;
  source: string | null;
  outcome: string;
  corrected_code: string | null;
  scanned_at: string;
  category: string | null;
}

/**
 * Records one scan.
 *
 * Never throws. Returns the new row's id so a later `correctScan` can point
 * at it, or `null` when the write failed (and `dropped` was incremented
 * instead). A camera loop that cannot write down what it just did must
 * still answer the person in front of it.
 */
export function recordScan(input: ScanInput): number | null {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const scannedAt = input.scannedAt ?? new Date().toISOString();
    const result = store.db
      .prepare(
        `INSERT INTO scan (device_id, kind, query_text, resolved_code, resolved_label, confidence, source, outcome, corrected_code, scanned_at, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        input.deviceId,
        input.kind,
        input.query ?? null,
        input.resolvedCode ?? null,
        input.resolvedLabel ?? null,
        input.confidence ?? null,
        input.source ?? null,
        input.outcome,
        scannedAt,
        input.category ?? null,
      );
    return Number(result.lastInsertRowid);
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return null;
  }
}

/**
 * Marks that a person overrode a scan's answer. Sets the outcome to
 * 'corrected' and records what the person said the right code was, so a
 * scan we got wrong stops counting against the device's free tier (see
 * `weeklyCount`) and the four downstream consumers can see it was wrong.
 *
 * Never throws. A row that does not exist, or a store that never opened,
 * is counted as a drop rather than raised.
 */
export function correctScan(scanId: number, correctedCode: string): void {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const result = store.db
      .prepare(`UPDATE scan SET outcome = 'corrected', corrected_code = ? WHERE id = ?`)
      .run(correctedCode, scanId);
    if (Number(result.changes) === 0) throw new Error(`no scan with id ${scanId}`);
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
  }
}

/**
 * The UTC-midnight start of the Monday on or before `now`, as an ISO
 * timestamp string, so it can be compared directly against `scanned_at`
 * (also ISO, also UTC, from `toISOString()`).
 */
function weekStartUtc(now: Date): string {
  const day = now.getUTCDay(); // Sunday = 0 ... Saturday = 6
  const daysSinceMonday = (day + 6) % 7; // Monday = 0 ... Sunday = 6
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday, 0, 0, 0, 0),
  );
  return start.toISOString();
}

/**
 * How many of this device's scans count against it this week: 'answered'
 * scans only, from UTC Monday 00:00 through now. A 'refused' scan is our
 * failure and is never counted; a scan since marked 'corrected' is a scan
 * we got wrong and is never counted either. This function does not invent
 * a quota; it returns a count. Whoever sets a limit reads it.
 *
 * `now` defaults to the real current time; a caller (a test) may pass an
 * explicit `Date` to check the boundary without mocking the clock.
 *
 * Never throws. Returns 0 when the store cannot be read, and counts the
 * failure the same way a failed write is counted.
 */
export function weeklyCount(deviceId: string, now: Date = new Date()): number {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const boundary = weekStartUtc(now);
    const row = store.db
      .prepare(`SELECT COUNT(*) as n FROM scan WHERE device_id = ? AND outcome = 'answered' AND scanned_at >= ?`)
      .get(deviceId, boundary) as unknown as { n: number } | undefined;
    return row?.n ?? 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return 0;
  }
}

/**
 * The id of this device's most recent scan that named `code`, or null.
 *
 * This exists so a correction can find the scan it corrects. The correction
 * route knows the device and the product code and nothing else about the scan
 * that produced the wrong answer, because the client never carried a scan id
 * back; asking it to would mean a round trip through a screen in a supermarket
 * aisle, and the id would be the one thing in the correction queue that a
 * re-install could invalidate. Device plus code is enough: a person correcting
 * a price is correcting the last thing they scanned of that product.
 *
 * Rows already marked corrected are skipped, so two corrections of the same
 * product mark two different scans rather than the same one twice.
 *
 * Never throws. A store that will not open returns null and counts the drop.
 */
export function lastAnsweredScan(deviceId: string, code: string): number | null {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const row = store.db
      .prepare(
        `SELECT id FROM scan
          WHERE device_id = ? AND resolved_code = ? AND outcome = 'answered'
          ORDER BY id DESC LIMIT 1`,
      )
      .get(deviceId, code) as unknown as { id: number } | undefined;
    return row ? Number(row.id) : null;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return null;
  }
}

/**
 * What this device has actually been shopping for, oldest first.
 *
 * The shape `catalogue/src/routing.ts` asks for, and nothing more: a list of
 * five-kind guesses in the order they happened, so its own fading function can
 * weigh recent scans above old ones. This function does no weighing and makes
 * no decision; it reads rows.
 *
 * WHAT IT LEAVES OUT, and each exclusion is the rule rather than a filter that
 * happened to be convenient:
 *
 *   - Rows with no category. Both the ones written before this column existed
 *     and the ones where the app looked and would not name a kind. Neither is
 *     evidence about the person, and counting an unknown as a vote for
 *     whatever is most common would manufacture a prior out of nothing.
 *   - Refusals. A scan that could not be answered says what the catalogue
 *     lacks, not what the person shops for. `outcome = 'corrected'` is kept:
 *     the person told us what it was, which is the strongest signal in the
 *     table about what they were actually holding.
 *   - Everything past `limit`, taken from the NEWEST end and then reversed,
 *     because a route about who somebody is today should not be outvoted by a
 *     year of who they were.
 *
 * Never throws. A store that will not open is a device with no history, which
 * `decideRoute` already handles as "search everything".
 */
export function recentCategories(deviceId: string, limit = 40): { category: string }[] {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const rows = store.db
      .prepare(
        `SELECT category FROM scan
          WHERE device_id = ? AND category IS NOT NULL AND outcome != 'refused'
          ORDER BY id DESC LIMIT ?`,
      )
      .all(deviceId, limit) as unknown as { category: string }[];
    // Newest-first out of SQL so the LIMIT keeps the recent end; routing wants
    // oldest-first so its decay runs the right way round.
    return rows.reverse();
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return [];
  }
}

/**
 * How many times each product was scanned in the last `windowDays`, across
 * every device.
 *
 * This is the seam `price/src/queue.ts` documents and has never been handed:
 * its `readScanCounts` defaults to an empty map, and with an empty map its own
 * main result -- scanned products no crawler can reach -- is empty by
 * construction. The ordering module has been correct and blind since it was
 * written.
 *
 * ACROSS EVERY DEVICE, deliberately, and this is the one place in this file
 * where that is the right answer. Everything else here is per-device because
 * it is about a person: their week, their free tier, their correction. This is
 * about the CATALOGUE -- what the crowd is asking for and cannot be told --
 * and a per-device count would rank a product ten people scanned once below a
 * product one person scanned twice.
 *
 * A WINDOW, not all history, because the question is what to price NEXT. A
 * product that was scanned fifty times in March and never since should not
 * outrank one being scanned today; queue.ts's own interval maths reads this as
 * "times this week" and the default matches.
 *
 * Refusals count here, unlike in `recentCategories`, and the difference is the
 * point of both. There, a refusal was not evidence about the person. Here, a
 * scan we could not answer is the single strongest reason to go and price
 * something. Rows with no resolved code are skipped only because there is no
 * code for a crawler to act on.
 *
 * Never throws. A store that will not open is an empty map, which is exactly
 * the default queue.ts already handles.
 */
export function scanCountsByCode(windowDays = 7, now: Date = new Date()): Map<string, number> {
  const store = active ?? openScanStore();
  const counts = new Map<string, number>();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = store.db
      .prepare(
        `SELECT resolved_code AS code, COUNT(*) AS n FROM scan
          WHERE resolved_code IS NOT NULL AND scanned_at >= ?
          GROUP BY resolved_code`,
      )
      .all(since) as unknown as { code: string; n: number }[];
    for (const row of rows) counts.set(String(row.code), Number(row.n));
    return counts;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return counts;
  }
}

/** Reads every row back, oldest first. Test and inspection helper only. */
export function allScans(store: ScanStore): ScanRow[] {
  if (!store.db) return [];
  return store.db.prepare('SELECT * FROM scan ORDER BY id ASC').all() as unknown as ScanRow[];
}
