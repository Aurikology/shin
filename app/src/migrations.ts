/**
 * The schema of the scan database, as a numbered list instead of a habit.
 *
 * WHY THIS FILE EXISTS. Until today every column added to `scan` after the
 * first release was added by an `addColumnIfMissing` call sitting in
 * `openScanStore`, in the order somebody happened to write it. That works for
 * two columns and it stopped working the night two lanes each added one: the
 * merge kept both calls and nothing anywhere could say which version of the
 * schema a given `scans.db` was at. On one laptop that is a shrug. On the Mac
 * that is about to hold six testers' scans it is the difference between a
 * backup you can restore and a file you have to inspect by hand.
 *
 * ADDITIVE ONLY, and that is a rule rather than a style. Every migration here
 * may add a table, add an index, or add a nullable column. None of them may
 * drop, rename, or retype anything, because the live `app/data/scans.db` was
 * written before any of this existed and a beta cannot afford a schema step
 * that has a failure mode worse than "the column was already there". SQLite's
 * own ALTER TABLE is close to this shape anyway; this file makes the
 * restriction explicit so the next person does not have to rediscover it.
 *
 * IDEMPOTENT BY CONSTRUCTION. Each migration is written so that running it
 * against a database that already has its effect is a no-op: tables are
 * CREATE TABLE IF NOT EXISTS, indexes are CREATE INDEX IF NOT EXISTS, and
 * columns go through `addColumnIfMissing`. That matters because migration 1
 * describes columns that ALREADY EXIST in every database on every machine: it
 * is the retroactive record of the two columns added ad hoc before there was
 * a version, and its whole job is to bring those files up to version 1 without
 * touching them.
 *
 * WHAT A VERSION NUMBER IS HERE. One row in `schema_version` per migration
 * that has been applied, with the name and the time it ran. Not a single
 * mutable number, because a single number tells you where a file got to and
 * never tells you what happened on the way, and the first question anybody
 * asks a database that is behaving oddly is when it changed.
 */

import type { DatabaseSync } from 'node:sqlite';

/**
 * Adds a column an older file does not have yet.
 *
 * Moved here from `scans.ts` on 2026-09-11, unchanged apart from being
 * exported, because it is the primitive every additive migration is built out
 * of and having one copy is the point of this file.
 *
 * There is a live scans.db in app/data written before `failure_class` existed,
 * and CREATE TABLE IF NOT EXISTS will not touch it. Checked with table_info
 * rather than a caught error, because a swallowed ALTER is how a column ends
 * up missing on one machine and present on another with nothing to read back.
 */
export function addColumnIfMissing(db: DatabaseSync, table: string, column: string, decl: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  if (columns.some((c) => c.name === column)) return;
  /*
   * The read above and the write below are not one operation. Two processes
   * opening this file at once can both see no column and both try to add it;
   * the busy timeout serialises the write, so the loser's ALTER runs after
   * the winner's committed and fails with `duplicate column name`. Without
   * this catch that throw escaped into the open, nulled the handle, and
   * turned the whole scan log off for the life of the process (D-057 as
   * merged). A column somebody else added is success; anything else is
   * rethrown, since a table that cannot take it is not a log this code can
   * use. Answered by re-reading the table, not by matching message text.
   */
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  } catch (err) {
    const again = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
    if (!again.some((c) => c.name === column)) throw err;
  }
}

export interface Migration {
  /** Unique, ascending, and never reused once it has shipped. */
  readonly version: number;
  /** What it did, in words, so `schema_version` reads as a history. */
  readonly name: string;
  apply(db: DatabaseSync): void;
}

const VERSION_DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
`;

/**
 * The list. Append only, and never renumber: a version that has run on any
 * machine is a fact about that file, and changing what a number means turns
 * every recorded row into a lie.
 */
export const SCAN_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'the two columns added before there was a version',
    apply(db) {
      // Both are in the base DDL for a fresh file, so this is entirely about
      // databases written before 2026-09-08. It is a no-op everywhere else.
      addColumnIfMissing(db, 'scan', 'category', 'TEXT');
      addColumnIfMissing(db, 'scan', 'failure_class', 'TEXT');
    },
  },
  {
    version: 2,
    name: 'the complete scan record',
    apply(db) {
      /*
       * Plan item 9. Before this, a scan row said what was asked and what came
       * back and nothing about the conditions the answer was produced under,
       * so a beta could tell you that 40% of photo scans were refused and
       * nothing about whether the slow ones were the wrong ones.
       *
       * Every column is nullable and every one of them stays null unless
       * something actually measured it. A zero in a latency column would be a
       * measurement; a null is the absence of one, and the two must not be the
       * same value (HARD RULE 3 in the agent repo, and the reason
       * `scan-summary.ts` reports a null rate rather than 0%).
       */
      // 9a. Where the photo was written, relative to the photos directory.
      // Null when there was no photo or when the device had not consented.
      addColumnIfMissing(db, 'scan', 'photo_path', 'TEXT');
      // 9b. The model's own output as JSON: what it read, brand, size,
      // confidence, the candidates it was choosing between and which one it
      // chose. Today only the chosen label survives the request.
      addColumnIfMissing(db, 'scan', 'model_json', 'TEXT');
      // 9c. The price somebody typed off the tag for this scan, in cents.
      addColumnIfMissing(db, 'scan', 'typed_price_cents', 'INTEGER');
      // 9d. The verdict as it was SHOWN, not as it could be recomputed. A
      // verdict is a function of the price evidence at that moment, and the
      // evidence moves; re-deriving it next week answers a different question
      // from the one the tester saw.
      addColumnIfMissing(db, 'scan', 'verdict_tier', 'TEXT');
      addColumnIfMissing(db, 'scan', 'verdict_confidence', 'TEXT');
      addColumnIfMissing(db, 'scan', 'verdict_sellers', 'INTEGER');
      // 9e. The conditions.
      addColumnIfMissing(db, 'scan', 'app_version', 'TEXT');
      addColumnIfMissing(db, 'scan', 'platform', 'TEXT');
      addColumnIfMissing(db, 'scan', 'latency_ms', 'INTEGER');
      // Cents, as a REAL, because one identification costs a fraction of one
      // cent and an INTEGER column would record every call as zero.
      addColumnIfMissing(db, 'scan', 'model_cost_cents', 'REAL');
    },
  },
  {
    version: 3,
    name: 'scan rating',
    apply(db) {
      /*
       * Plan item 8a. One rating per scan, which is why `scan_id` is the
       * primary key rather than a column with an index: "a second tap
       * overwrites" is the product rule, and a table that can hold two rows
       * for one scan makes that rule something the route has to remember
       * instead of something the schema enforces.
       *
       * `device_id` is kept even though the scan row already has one. It is
       * who rated, which is not the same fact as who scanned, and on the day
       * accounts exist those two can differ.
       *
       * No foreign key. The rest of this database has none either, and the
       * route checks that the scan exists before it writes; a constraint here
       * would turn a rating for a scan that was dropped (the scan log drops
       * rather than throws, by design) into an exception on a path whose whole
       * job is to be unfailing.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS scan_rating (
          scan_id   INTEGER PRIMARY KEY,
          device_id TEXT NOT NULL,
          rating    TEXT NOT NULL CHECK (rating IN ('up', 'down')),
          reason    TEXT,
          rated_at  TEXT NOT NULL
        ) STRICT;
      `);
      db.exec('CREATE INDEX IF NOT EXISTS scan_rating_device ON scan_rating(device_id, rated_at);');
    },
  },
  {
    version: 4,
    name: 'event log',
    apply(db) {
      /*
       * Plan item 10a. One table for client events and server events both,
       * because the question a beta asks is "what happened, in order" and two
       * tables would mean interleaving them by hand every time.
       *
       * `payload` is JSON text rather than columns. This table has to take an
       * event type nobody has thought of yet without a migration, which is the
       * one place in this database where that is the right trade: nothing
       * queries inside the payload, the export dumps it whole, and a schema
       * per event type would be a schema change per screen.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS event (
          id         INTEGER PRIMARY KEY,
          device_id  TEXT NOT NULL,
          type       TEXT NOT NULL,
          payload    TEXT,
          created_at TEXT NOT NULL
        ) STRICT;
      `);
      // The export reads a date range across every device; the profile screen
      // and any per-device question read newest-first under one device.
      db.exec('CREATE INDEX IF NOT EXISTS event_created ON event(created_at);');
      db.exec('CREATE INDEX IF NOT EXISTS event_device ON event(device_id, id DESC);');
    },
  },
  {
    version: 5,
    name: 'consent',
    apply(db) {
      /*
       * Plan item 6c. One row per device holding the two answers and when they
       * were last changed.
       *
       * BOTH DEFAULT OFF and the default is the ABSENCE of a row, not a row of
       * zeroes. A device that has never answered and a device that answered no
       * are the same thing to the server (keep nothing), and writing a row for
       * the first would claim a choice nobody made.
       *
       * ONLY THE CURRENT ANSWER IS KEPT. A history of consent changes is a
       * better record and it is also a second thing to delete when somebody
       * asks to be forgotten; the beta's promise is "off means nothing is
       * kept", and an audit trail of when you said no is still something kept.
       * The event log records the change as an event, which is where a
       * question about the sequence belongs.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS consent (
          device_id  TEXT PRIMARY KEY,
          photos     INTEGER NOT NULL CHECK (photos IN (0, 1)),
          location   INTEGER NOT NULL CHECK (location IN (0, 1)),
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
    },
  },
  {
    version: 6,
    name: 'the store a scan happened in',
    apply(db) {
      /*
       * Plan item 11b and 11c. The cell is the coarse square the phone was in,
       * never coordinates; `stores.ts` snaps anything it is handed onto a
       * 0.01 degree grid before it reaches this column, so a client that sent
       * six decimal places does not get six decimal places stored.
       *
       * The store is an OpenStreetMap id and the name as OSM had it, copied
       * rather than referenced, because the answer to "which shop was this
       * price in" has to survive OSM renaming or deleting the node.
       */
      addColumnIfMissing(db, 'scan', 'cell', 'TEXT');
      addColumnIfMissing(db, 'scan', 'store_id', 'TEXT');
      addColumnIfMissing(db, 'scan', 'store_name', 'TEXT');
    },
  },
  {
    version: 7,
    name: 'user id, nullable everywhere, and the device link table',
    apply(db) {
      /*
       * Plan item 12. There are no accounts and there is no sign-up screen.
       * The columns go in now anyway, and that is the point of the item: the
       * alternative is adding them on the day accounts ship, to tables that by
       * then hold a beta's worth of rows, in the same change that has to
       * backfill them. Nullable, unread, and unwritten until then.
       *
       * The link table is deliberately empty. One device can belong to one
       * user at a time and one user can have several devices, so the device is
       * the key.
       */
      addColumnIfMissing(db, 'scan', 'user_id', 'TEXT');
      addColumnIfMissing(db, 'scan_rating', 'user_id', 'TEXT');
      addColumnIfMissing(db, 'event', 'user_id', 'TEXT');
      addColumnIfMissing(db, 'consent', 'user_id', 'TEXT');
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_user (
          device_id  TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL,
          linked_at  TEXT NOT NULL
        ) STRICT;
      `);
      db.exec('CREATE INDEX IF NOT EXISTS device_user_user ON device_user(user_id);');
    },
  },
  {
    version: 8,
    name: 'exact location alongside the coarse cell',
    apply(db) {
      /*
       * Founder's word, 2026-09-14: "build everything for collecting
       * EVERYTHING". `cell` (migration 6) is the kilometre grid square,
       * coarse by construction and the only thing `stores.ts` will ever read
       * back. These four columns are the reading it was snapped from: the
       * latitude and longitude the device's own GPS reported, the accuracy
       * the OS attached to that reading, and when it was taken -- kept
       * alongside the cell rather than instead of it, because the cell is
       * still what a shop lookup matches against and the exact fix is what
       * training and answering other shoppers wants.
       *
       * Nullable, like every column in migration 2's complete scan record:
       * written only when location consent is on (default true, see
       * `consent.ts`) and the OS actually granted a position, never a zero
       * standing in for "nobody measured this".
       */
      addColumnIfMissing(db, 'scan', 'exact_lat', 'REAL');
      addColumnIfMissing(db, 'scan', 'exact_lon', 'REAL');
      addColumnIfMissing(db, 'scan', 'exact_accuracy', 'REAL');
      addColumnIfMissing(db, 'scan', 'exact_at', 'TEXT');
    },
  },
];

/** What `schema_version` says this database is at. 0 means nothing has run. */
export function schemaVersion(db: DatabaseSync): number {
  db.exec(VERSION_DDL);
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as unknown as
    | { v: number | null }
    | undefined;
  return Number(row?.v ?? 0);
}

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  /** The names of the migrations this call ran, in order. Empty is the normal case. */
  readonly applied: readonly string[];
}

/**
 * Runs every migration above the database's current version, in order.
 *
 * ONE TRANSACTION PER MIGRATION, not one for the batch. SQLite's DDL is
 * transactional, so a migration that throws half way through leaves nothing
 * behind and does not record its version; the next start tries it again. A
 * single transaction around all of them would mean one bad migration rolls
 * back six good ones on every start, forever.
 *
 * THROWS. This is the one thing in the scan-log path that is allowed to,
 * because a database whose shape is unknown is not something to write scans
 * into and hope. `openScanStore` catches it, nulls the handle and counts every
 * later write as a drop, which is the contract it already keeps for a file it
 * could not open at all.
 */
export function runMigrations(
  db: DatabaseSync,
  migrations: readonly Migration[] = SCAN_MIGRATIONS,
  now: Date = new Date(),
): MigrationResult {
  const from = schemaVersion(db);
  const pending = [...migrations].filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  const applied: string[] = [];
  for (const migration of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.apply(db);
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        now.toISOString(),
      );
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* Already rolled back by the failure itself. Nothing to add. */
      }
      throw err;
    }
    applied.push(migration.name);
  }
  return { from, to: schemaVersion(db), applied };
}
