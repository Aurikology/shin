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
import { runMigrations } from './migrations.ts';
import type { VerifyResult } from '../../identify/src/providers/price-verifier.ts';

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
  failure_class  TEXT,
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
 * Why a scan failed, added 2026-09-08 as a column of its own.
 *
 * The beta readiness audit found every failure of the vision path arriving at
 * the user as one sentence, the photo could not be read, and therefore also
 * arriving here as one undifferentiated 'refused'. An outage during a beta
 * would then be indistinguishable from bad photographs in the data, which is
 * the one thing this table exists to make readable afterwards.
 *
 * The vocabulary is identify/src/model.ts's, restated because this package
 * does not import that one. Null on every answered scan and on any refusal
 * whose caller did not classify it, so a null means unclassified and never
 * means fine.
 */
export type FailureClass =
  | 'unreadable_photo'
  | 'model_timeout'
  | 'model_rate_limited'
  | 'model_outage'
  | 'model_malformed'
  | 'model_client_error'
  | 'spend_cap_reached'
  | 'not_in_catalogue'
  /**
   * ITEM 2 (docs/scanner-build-order-2026-09-19.md section 2). A barcode that
   * fails the GS1 check digit in every zero-pad form (`app/src/barcode.ts`,
   * `canonicalGtin`) and is refused before Gemini is ever called, so it is
   * never spent on a reading that could not have been trusted anyway.
   */
  | 'invalid_barcode';

/*
 * `addColumnIfMissing` used to live here and now lives in `migrations.ts`,
 * moved 2026-09-11 when the ad-hoc column additions below became a numbered
 * list. It is the primitive every additive migration is built out of, and the
 * two calls it used to have here are migration 1.
 */

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
     * Everything added after the first release, as a numbered list that this
     * file no longer has an opinion about. See `migrations.ts`: the two
     * columns that used to be added by hand here are migration 1, and every
     * table the beta added (ratings, events, consent, the store on a scan, the
     * user id) is a migration above it.
     *
     * It runs on every open, not on a flag, because that is what makes the
     * live `app/data/scans.db` and a temp file in a test the same shape: a
     * database at version 7 does nothing here, and a database at 0 catches up
     * before the first scan is written.
     */
    runMigrations(db);
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
   * Why, when the outcome is 'refused'. Added 2026-09-08 alongside `outcome`
   * rather than folded into it: 'refused' is what the person experienced and
   * the free-tier rule reads it, while this is what happened on our side and
   * only the defect log reads it. Merging them would have made the metering
   * rule depend on an outage.
   */
  readonly failureClass?: FailureClass | null;
  /**
   * Overrides the recorded timestamp. Tests use this to place a row in a
   * specific week without mocking the clock; real callers should omit it
   * and get `new Date().toISOString()`.
   */
  readonly scannedAt?: string;

  /*
   * THE COMPLETE SCAN RECORD, plan item 9, added 2026-09-11.
   *
   * Everything below is a fact about the CONDITIONS the answer was produced
   * under rather than about the answer, and all of it is optional. A caller
   * that measured none of it writes nulls, which is what every caller did
   * before today and what the `what-to-price` CLI still does.
   *
   * None of it is required and none of it has a default that stands in for a
   * measurement. A latency of 0 would be a claim that the call was instant; a
   * null is the honest record that nobody timed it.
   */

  /** What the model itself said, whole, as JSON. Photo scans only. */
  readonly modelJson?: string | null;
  /** Cents, fractional, estimated rather than billed. See `model-cost.ts`. */
  readonly modelCostCents?: number | null;
  /** The client's own build string, as the client reported it. */
  readonly appVersion?: string | null;
  /** ios, android, web, or whatever the client calls itself. Not derived here. */
  readonly platform?: string | null;
  /** Round trip on the server side: request in to answer out, milliseconds. */
  readonly latencyMs?: number | null;
  /**
   * The coarse square the phone was in, already snapped by `stores.ts`.
   * Written only when the device has consented to location (see `consent.ts`);
   * the route, not this function, is what refuses.
   */
  readonly cell?: string | null;
  readonly storeId?: string | null;
  readonly storeName?: string | null;
  /**
   * The exact reading the cell was snapped from. Migration 8, 2026-09-14.
   * Written only alongside `cell` (same consent, same gate in `locationFor`),
   * never on its own: a device that has not consented to location gets none
   * of the four, and a device that has but whose OS declined to hand back a
   * position also gets none, because there was nothing to write down.
   */
  readonly exactLat?: number | null;
  readonly exactLon?: number | null;
  readonly exactAccuracy?: number | null;
  readonly exactAt?: string | null;
  /** Null until accounts exist. Plan item 12. */
  readonly userId?: string | null;
  /**
   * ITEM 19 (docs/scanner-build-order-2026-09-19.md section 19). True only
   * for the fixed sample answer `/api/identify/demo` returns with no
   * provider call. Defaults to false so every existing caller, which never
   * heard of this field, writes a real row exactly as before. A demo row is
   * still written (rule 4, "record everything" -- a demo is still an
   * interaction), but it is marked at write time so no reader that computes
   * a rate over real scans (`scan-summary.ts`, the free-tier meter) can
   * count it without knowing to.
   */
  readonly isDemo?: boolean;
}

/**
 * The fields of a scan row that are learned AFTER the row is written.
 *
 * Four of item 9's facts cannot be known at insert time and this is why there
 * are two ways to write a scan rather than one enormous one:
 *
 *   - the photo path, because the file is named after the row id;
 *   - the typed price, which arrives on a later request from the corrections
 *     screen, sometimes the next morning from an aisle with no signal;
 *   - the verdict as shown, which is a second request to `/api/price` about an
 *     identity the first request produced;
 *   - the store, which the person picks from a list after the scan.
 *
 * Anything left `undefined` is not written. A key present with `null` IS
 * written, so a consent withdrawal can clear a photo path. That distinction is
 * the whole reason this is a patch object and not a positional argument list.
 */
export interface ScanPatch {
  readonly photoPath?: string | null;
  readonly typedPriceCents?: number | null;
  readonly verdictTier?: string | null;
  readonly verdictConfidence?: string | null;
  readonly verdictSellers?: number | null;
  readonly cell?: string | null;
  readonly storeId?: string | null;
  readonly storeName?: string | null;
  readonly modelJson?: string | null;
  readonly latencyMs?: number | null;
  readonly modelCostCents?: number | null;
  readonly userId?: string | null;
}

/**
 * The only mapping from a patch key to a column name, and the reason
 * `updateScan` can build SQL by concatenation without being an injection.
 *
 * A caller hands in an object whose keys came off a JSON body on a bad day;
 * anything not on this list is dropped before a string is built, so the SET
 * clause is assembled out of these literals and nothing else.
 */
const PATCH_COLUMNS: Readonly<Record<keyof ScanPatch, string>> = {
  photoPath: 'photo_path',
  typedPriceCents: 'typed_price_cents',
  verdictTier: 'verdict_tier',
  verdictConfidence: 'verdict_confidence',
  verdictSellers: 'verdict_sellers',
  cell: 'cell',
  storeId: 'store_id',
  storeName: 'store_name',
  modelJson: 'model_json',
  latencyMs: 'latency_ms',
  modelCostCents: 'model_cost_cents',
  userId: 'user_id',
};

export interface ScanRow {
  id: number;
  device_id: string;
  kind: string;
  query_text: string | null;
  resolved_code: string | null;
  resolved_label: string | null;
  confidence: number | null;
  source: string | null;
  outcome: string;
  failure_class: string | null;
  corrected_code: string | null;
  scanned_at: string;
  category: string | null;
  // The complete scan record, plan item 9. Every one of them is null on a row
  // written before 2026-09-11 and on any row whose caller measured nothing.
  photo_path: string | null;
  model_json: string | null;
  typed_price_cents: number | null;
  verdict_tier: string | null;
  verdict_confidence: string | null;
  verdict_sellers: number | null;
  app_version: string | null;
  platform: string | null;
  latency_ms: number | null;
  model_cost_cents: number | null;
  cell: string | null;
  store_id: string | null;
  store_name: string | null;
  exact_lat: number | null;
  exact_lon: number | null;
  exact_accuracy: number | null;
  exact_at: string | null;
  user_id: string | null;
  /*
   * THE GROUNDED COLUMNS, migration 9, and note which one is missing.
   *
   * `grounded_at` and `grounded_shown` are facts ABOUT a Grounded Result: when
   * it was fetched and whether it ever reached the person who asked. Anything
   * may read those.
   *
   * `grounded_json` -- the text itself -- is deliberately not on this type,
   * and that is not an oversight to be tidied up later. `getScan` is a
   * `SELECT *` used by the rating and correction routes, and the moment the
   * text is a typed field on the row every one of those callers can hand a
   * Grounded Result to somebody who is not its owner by passing the row along.
   * Google's terms say it is shown only to the end user who submitted the
   * prompt, so the only file that names that column is
   * `grounded-record.ts`, which reads it through a row type of its own and
   * checks `device_id` before it writes.
   */
  grounded_at: string | null;
  grounded_shown: number | null;
  // Item 19: 1 on the fixed sample answer, 0 on everything else. See ScanInput.isDemo.
  is_demo: number;
  /*
   * ITEM 11 (docs/scanner-build-order-2026-09-19.md section 11), ruling 7
   * (docs/decisions.md, "Nine rulings", 2026-09-19): a later, better answer
   * from a background pass goes HERE, beside verdict_zone/typed_price_cents,
   * never over them. `enriched_checked_at` moves on every background look,
   * whether or not anything changed; `enriched_updated_at` moves only when
   * the value actually changed. See `enrichScan`.
   */
  enriched_price_cents: number | null;
  enriched_verdict_zone: string | null;
  enriched_checked_at: string | null;
  enriched_updated_at: string | null;
}

/**
 * The two price percentages, per device. Migration 9's `device_preference`.
 *
 * Ten and ten are the defaults and they live in the column declarations, so
 * this reader never invents them: a device with no row gets the same two
 * numbers a fresh insert would, and there is one place to change them.
 */
export interface Preferences {
  readonly goodUnderPct: number;
  readonly highOverPct: number;
}

export const DEFAULT_PREFERENCES: Preferences = { goodUnderPct: 10, highOverPct: 10 };

interface PreferenceRow {
  good_under_pct: number;
  high_over_pct: number;
}

/**
 * What this device has asked for, or the defaults. Never throws: a store that
 * will not open is a device with no preferences, which is the same answer as a
 * device that never set any.
 */
export function readPreferences(deviceId: string): Preferences {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const row = store.db
      .prepare('SELECT good_under_pct, high_over_pct FROM device_preference WHERE device_id = ?')
      .get(deviceId) as unknown as PreferenceRow | undefined;
    if (!row) return DEFAULT_PREFERENCES;
    return { goodUnderPct: row.good_under_pct, highOverPct: row.high_over_pct };
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Sets one or both percentages for a device. Never throws; returns whether the
 * row is now what was asked for.
 *
 * A key left `undefined` keeps whatever is stored, the same distinction
 * `ScanPatch` makes, so a screen that offers one slider cannot silently reset
 * the other one to a default.
 */
export function writePreferences(
  deviceId: string,
  patch: { goodUnderPct?: number; highOverPct?: number },
  now: Date = new Date(),
): boolean {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const current = readPreferences(deviceId);
    const good = Number.isFinite(patch.goodUnderPct) ? Number(patch.goodUnderPct) : current.goodUnderPct;
    const high = Number.isFinite(patch.highOverPct) ? Number(patch.highOverPct) : current.highOverPct;
    store.db
      .prepare(
        `INSERT INTO device_preference (device_id, good_under_pct, high_over_pct, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (device_id) DO UPDATE SET good_under_pct = excluded.good_under_pct,
           high_over_pct = excluded.high_over_pct, updated_at = excluded.updated_at`,
      )
      .run(deviceId, good, high, now.toISOString());
    return true;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
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
        `INSERT INTO scan (device_id, kind, query_text, resolved_code, resolved_label, confidence, source, outcome, failure_class, corrected_code, scanned_at, category,
                           model_json, model_cost_cents, app_version, platform, latency_ms, cell, store_id, store_name, exact_lat, exact_lon, exact_accuracy, exact_at, user_id, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.failureClass ?? null,
        scannedAt,
        input.category ?? null,
        input.modelJson ?? null,
        input.modelCostCents ?? null,
        input.appVersion ?? null,
        input.platform ?? null,
        input.latencyMs ?? null,
        input.cell ?? null,
        input.storeId ?? null,
        input.storeName ?? null,
        input.exactLat ?? null,
        input.exactLon ?? null,
        input.exactAccuracy ?? null,
        input.exactAt ?? null,
        input.userId ?? null,
        input.isDemo ? 1 : 0,
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
 * Fills in the part of a scan record that was not known when the row was
 * written: the photo file, the price somebody typed, the verdict they were
 * shown, the store they picked.
 *
 * Never throws, and returns whether a row actually moved. `false` means the
 * scan id named nothing, which is the normal answer to a client holding an id
 * from before a reinstall or from another machine, and it is a fact the caller
 * usually wants to ignore rather than report.
 *
 * A patch with no known keys writes nothing and returns false rather than
 * running `UPDATE scan SET WHERE id = ?`, which is a syntax error, not an
 * empty update.
 */
export function updateScan(scanId: number, patch: ScanPatch): boolean {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const key of Object.keys(PATCH_COLUMNS) as (keyof ScanPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      sets.push(`${PATCH_COLUMNS[key]} = ?`);
      values.push(value === null ? null : value);
    }
    if (sets.length === 0) return false;
    values.push(scanId);
    const result = store.db.prepare(`UPDATE scan SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return Number(result.changes) > 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * One scan row by id, or null.
 *
 * The rating route needs it to answer "is that a real scan id" without
 * trusting the client, and the correction route needs it to attach a typed
 * price to the product the scan actually named (plan item 7c, and the fix for
 * the defect where a correction was stored with no product on it at all).
 *
 * Never throws: a store that will not open is a scan id that names nothing,
 * which is the same answer the caller has to handle anyway.
 */
export function getScan(scanId: number): ScanRow | null {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const row = store.db.prepare('SELECT * FROM scan WHERE id = ?').get(scanId) as unknown as ScanRow | undefined;
    return row ?? null;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return null;
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
    // Item 19: a demo row never counts against a device's free tier, the
    // same way a demo row never counts in scan-summary.ts's rates.
    const row = store.db
      .prepare(
        `SELECT COUNT(*) as n FROM scan WHERE device_id = ? AND outcome = 'answered' AND scanned_at >= ? AND is_demo = 0`,
      )
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

/* --------------------------------------------- every Gemini call, stored whole */

/**
 * ITEM 12 (docs/beta-gaps-2026-09-19.md), Jamin's rule 4: every Gemini request
 * and its full response, linked to the scan and to the model that answered.
 * The table is migration 12. `requestJson` carries the body as sent with image
 * bytes replaced by a hash-and-size stub; the photo itself is stored only under
 * the consent flag, elsewhere.
 */
export interface GeminiCallRecord {
  readonly scanId: number | null;
  readonly deviceId: string;
  readonly model: string;
  readonly family: string;
  readonly via: string;
  readonly scanType: string;
  readonly requestedAt?: string;
  readonly ms: number | null;
  readonly requestJson: string;
  readonly systemText: string | null;
  readonly promptText: string;
  readonly inputRef: string | null;
  readonly thresholdsJson: string | null;
  readonly shelfPriceCents: number | null;
  readonly responseRaw: string | null;
  readonly answerText: string | null;
  readonly httpStatus: number | null;
  readonly parseStatus: string | null;
  readonly failureClass: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly searchQueries: number | null;
  /** 'per_prompt' on 2.5 (search bills per grounded prompt), 'per_query' on 3.x. */
  readonly billingBasis: string;
  readonly lowConfidence: boolean;
  /** Used Google Search: a mark for the grounded-results terms, never a block. */
  readonly grounded: boolean;
}

export interface GeminiCallRow {
  readonly id: number;
  readonly scan_id: number | null;
  readonly device_id: string;
  readonly model: string;
  readonly model_family: string;
  readonly model_via: string;
  readonly scan_type: string;
  readonly request_json: string;
  readonly system_text: string | null;
  readonly prompt_text: string;
  readonly input_ref: string | null;
  readonly thresholds_json: string | null;
  readonly shelf_price_cents: number | null;
  readonly response_raw: string | null;
  readonly answer_text: string | null;
  readonly http_status: number | null;
  readonly parse_status: string | null;
  readonly failure_class: string | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly search_queries: number | null;
  readonly billing_basis: string | null;
  readonly low_confidence: number;
  readonly grounded: number;
  readonly math_check: string;
  readonly math_mismatches: string | null;
  readonly math_checked_at: string | null;
  readonly price_verify_check: string | null;
  readonly price_verify_retailer: string | null;
  readonly price_verify_url: string | null;
  readonly price_verify_page_cents: number | null;
  readonly price_verify_stated_cents: number | null;
  readonly price_verify_reason: string | null;
  readonly price_verify_checked_at: string | null;
}

/** Never throws. Null when the write dropped, which is counted like any other dropped write. */
export function recordGeminiCall(r: GeminiCallRecord): number | null {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const result = store.db
      .prepare(
        `INSERT INTO gemini_call (scan_id, device_id, model, model_family, model_via, scan_type, requested_at, ms,
                                  request_json, system_text, prompt_text, input_ref, thresholds_json, shelf_price_cents,
                                  response_raw, answer_text, http_status, parse_status, failure_class,
                                  input_tokens, output_tokens, search_queries, billing_basis, low_confidence, grounded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        r.scanId,
        r.deviceId,
        r.model,
        r.family,
        r.via,
        r.scanType,
        r.requestedAt ?? new Date().toISOString(),
        r.ms,
        r.requestJson,
        r.systemText,
        r.promptText,
        r.inputRef,
        r.thresholdsJson,
        r.shelfPriceCents,
        r.responseRaw,
        r.answerText,
        r.httpStatus,
        r.parseStatus,
        r.failureClass,
        r.inputTokens,
        r.outputTokens,
        r.searchQueries,
        r.billingBasis,
        r.lowConfidence ? 1 : 0,
        r.grounded ? 1 : 0,
      );
    return Number(result.lastInsertRowid);
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return null;
  }
}

/**
 * ITEM 14. The background pass writes its verdict on the stored call: 'ok',
 * 'mismatch' (with the differences), 'partial' (nothing disagreed, but the dollar
 * zone could not be run; the skip reasons are in the mismatches column, and it is
 * not a mismatch) or 'unchecked' (no math to check). A mismatch row carries
 * `input_ref` and `prompt_text` already, which is what "marks the scan with its
 * input and the exact prompt" means here.
 */
export function markGeminiMath(
  callId: number,
  check: 'ok' | 'mismatch' | 'partial' | 'unchecked',
  mismatches: readonly unknown[] | null,
  now: Date = new Date(),
): boolean {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const result = store.db
      .prepare('UPDATE gemini_call SET math_check = ?, math_mismatches = ?, math_checked_at = ? WHERE id = ?')
      .run(check, mismatches ? JSON.stringify(mismatches) : null, now.toISOString(), callId);
    return Number(result.changes) > 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * Ruling 3 (docs/decisions.md, "Nine rulings so the competitor-survey build
 * could start", 2026-09-19). The price verifier's own outcome, recorded
 * beside the call it checked -- never shown, and never a second price the
 * one already shown could be swapped for. Same shape as `markGeminiMath`
 * above: never throws, a failed write is counted like any other dropped
 * write, and it can only ever write a mark.
 */
export function markPriceVerification(callId: number, result: VerifyResult, now: Date = new Date()): boolean {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const updated = store.db
      .prepare(
        `UPDATE gemini_call
           SET price_verify_check = ?, price_verify_retailer = ?, price_verify_url = ?,
               price_verify_page_cents = ?, price_verify_stated_cents = ?, price_verify_reason = ?,
               price_verify_checked_at = ?
         WHERE id = ?`,
      )
      .run(result.outcome, result.retailer, result.url, result.pageCents, result.statedCents, result.reason, now.toISOString(), callId);
    return Number(updated.changes) > 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * ITEM 11 (docs/scanner-build-order-2026-09-19.md section 11), ruling 7
 * (docs/decisions.md, "Nine rulings", 2026-09-19): "Background enrichment
 * writes beside the shown value, never over it. A later, better answer goes
 * in its own column with its own timestamp, and the value the user was shown
 * stays exactly as they saw it."
 *
 * This is the one function that writes `enriched_price_cents` /
 * `enriched_verdict_zone`. It never touches `verdict_tier`, `verdict_zone`,
 * `verdict_confidence`, `verdict_sellers` or `typed_price_cents` -- those are
 * `updateScan`'s and `markScan`'s columns, and they hold exactly what the
 * person was shown at scan time, unconditionally, forever.
 *
 * `enriched_checked_at` moves on every call, whether or not anything
 * changed, so a background pass that looked and found nothing new is
 * distinguishable from a scan nobody ever went back to check.
 * `enriched_updated_at` moves only when a value in the patch differs from
 * what is already recorded, the checked-versus-changed split
 * `docs/scanner-build-order-2026-09-19.md` section 11 names in ha-wine-
 * cellar's own `checked_at`/`updated_at` pair.
 *
 * A key left `undefined` in the patch is left alone, the same convention
 * `ScanPatch` uses; there is no way to CLEAR an enriched value once written,
 * because nothing in this product ever needs to un-learn one.
 *
 * Never throws. Returns false for a scan id that names no row, the same
 * "the id was stale, not a bug" answer `updateScan` gives.
 */
export interface ScanEnrichment {
  readonly priceCents?: number | null;
  readonly verdictZone?: string | null;
}

export function enrichScan(scanId: number, patch: ScanEnrichment, now: Date = new Date()): boolean {
  const store = active ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const current = store.db
      .prepare('SELECT enriched_price_cents, enriched_verdict_zone FROM scan WHERE id = ?')
      .get(scanId) as unknown as { enriched_price_cents: number | null; enriched_verdict_zone: string | null } | undefined;
    if (!current) return false;

    const priceChanged = patch.priceCents !== undefined && patch.priceCents !== current.enriched_price_cents;
    const zoneChanged = patch.verdictZone !== undefined && patch.verdictZone !== current.enriched_verdict_zone;
    const changed = priceChanged || zoneChanged;
    const nowIso = now.toISOString();

    const nextPrice = patch.priceCents !== undefined ? patch.priceCents : current.enriched_price_cents;
    const nextZone = patch.verdictZone !== undefined ? patch.verdictZone : current.enriched_verdict_zone;

    const result = store.db
      .prepare(
        `UPDATE scan SET enriched_price_cents = ?, enriched_verdict_zone = ?, enriched_checked_at = ?,
           enriched_updated_at = CASE WHEN ? THEN ? ELSE enriched_updated_at END
         WHERE id = ?`,
      )
      .run(nextPrice, nextZone, nowIso, changed ? 1 : 0, nowIso, scanId);
    return Number(result.changes) > 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/** The calls made for one scan, oldest first. Test and inspection helper. */
export function geminiCallsForScan(scanId: number): GeminiCallRow[] {
  const store = active ?? openScanStore();
  if (!store.db) return [];
  return store.db.prepare('SELECT * FROM gemini_call WHERE scan_id = ? ORDER BY id ASC').all(scanId) as unknown as GeminiCallRow[];
}

/** Every call whose math check found a mismatch, newest first. The review list item 14 exists to build. */
export function geminiMathMismatches(limit = 100): GeminiCallRow[] {
  const store = active ?? openScanStore();
  if (!store.db) return [];
  return store.db
    .prepare("SELECT * FROM gemini_call WHERE math_check = 'mismatch' ORDER BY id DESC LIMIT ?")
    .all(limit) as unknown as GeminiCallRow[];
}
