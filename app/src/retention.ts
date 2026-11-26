/**
 * How long Pexi keeps what it records (Jamin's App Store list, 2026-11-05, item 8). Apple and
 * Canada's privacy law both want a stated period, and nothing here was ever deleted.
 *
 *   request logs (access.log)        90 days, then the line is deleted
 *   usage events (the event table)   12 months, then the row is deleted
 *   scans, ratings, shopper prices   24 months, then the row stays and its device id goes
 *
 * The privacy policy (docs/store/privacy.html, privacy-fr.html) states these numbers. Change one
 * and change the policy with it; test/retention.test.ts holds the policy to these constants.
 *
 * A ROW LOSES ITS DEVICE ID, IT IS NOT DELETED, because a price and an answer are still evidence
 * with nobody attached. The id becomes `removed:<row id>`: every row stays its own witness, and the
 * corrections store's one-report-per-shop-per-day index cannot collide. Migration 21 is what lets
 * the database accept exactly this one edit on rows it otherwise refuses to edit.
 *
 * WHAT THIS DOES NOT REACH: the Mac's nightly backups and the server's own stdout log, which live
 * outside this process (notes/catch-up.md 2026-11-06 asks Jamin to match them).
 *
 * NEVER THROWS, like the sweeps beside it in server.ts: each part reports what it did or why not.
 */
import { createReadStream, createWriteStream, existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import * as settings from '../../settings/src/index.ts';
import { peoplePath } from './admin.ts';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { accessLogPath } from './access-log.ts';
import { activeScanStore, openScanStore } from './scans.ts';
import { currentCorrectionStore, openCorrectionStore, removeOldDeviceIds } from '../../price/src/corrections.ts';
import { removeOldShopperDeviceIds } from '../../price/src/shopper-prices.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export const REQUEST_LOG_DAYS = 90;
export const USAGE_EVENT_MONTHS = 12;
export const DEVICE_ID_MONTHS = 24;
/** The longest a safety copy made by a hand deletion is kept. */
export const SAFETY_COPY_DAYS = 30;

/** The mark a device id is replaced with. Migration 21's triggers allow this edit and no other. */
export const REMOVED_PREFIX = 'removed:';

function monthsBefore(now: Date, months: number): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

/** Every table with a device id on a row about a scan, and the time column that dates the row. */
const DEVICE_TABLES: readonly { table: string; key: string; at: string; also?: string }[] = [
  { table: 'scan', key: 'id', at: 'scanned_at' },
  { table: 'scan_rating', key: 'scan_id', at: 'rated_at' },
  { table: 'scan_rating_history', key: 'id', at: 'rated_at' },
  { table: 'scan_pick', key: 'id', at: 'picked_at', also: 'net_hash = NULL' },
  { table: 'scan_offer', key: 'id', at: 'offered_at' },
  { table: 'scan_later_answer', key: 'id', at: 'recorded_at' },
  { table: 'scan_act_outcome', key: 'scan_id', at: 'updated_at' },
  { table: 'gemini_call', key: 'id', at: 'requested_at' },
];

export interface ScanRetentionResult {
  readonly eventsDeleted: number;
  readonly deviceIdsRemoved: number;
  /** Device-only rows (consent, secret hash, preferences, user link, Plus record) deleted after 24 idle months. */
  readonly deviceRecordsDeleted: number;
  /** Old Gemini calls whose stored words were cleared. */
  readonly geminiBodiesCleared: number;
  readonly failed: readonly string[];
}

/**
 * Tables that hold ONLY a device id and what it said or proved (no scan row hangs off them). The
 * policy's 24 months applies to them as to the scan tables, but their row is not evidence anybody
 * else needs, so it is deleted instead of de-identified. `at` is the row's own last-touched column.
 *
 * A device that is still in use keeps its rows: the secret (`device_key`) and the consent record of
 * a phone that scanned or sent usage inside the window must not vanish under it. "In use" is any
 * row for the device, newer than the cutoff, in a table of ACTIVITY_TABLES below.
 */
const DEVICE_RECORD_TABLES: readonly { table: string; at: string }[] = [
  { table: 'consent', at: 'updated_at' },
  { table: 'device_key', at: 'bound_at' },
  { table: 'device_preference', at: 'updated_at' },
  { table: 'device_user', at: 'linked_at' },
  { table: 'plus_seen', at: 'seen_at' },
];

const ACTIVITY_TABLES: readonly { table: string; at: string }[] = [
  { table: 'scan', at: 'scanned_at' },
  { table: 'event', at: 'created_at' },
  { table: 'scan_rating', at: 'rated_at' },
  { table: 'scan_pick', at: 'picked_at' },
  { table: 'scan_offer', at: 'offered_at' },
];

/**
 * The words of the Gemini calls Pexi used to store whole (the request, the prompt, the reply). No
 * live code writes a call any more; the old rows keep their counts (model, time, tokens) and lose
 * their text. Safe to run every day: a row already blank is not touched.
 */
function clearGeminiBodies(db: DatabaseSync): number {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gemini_call'").get();
  if (!exists) return 0;
  const r = db
    .prepare(
      `UPDATE gemini_call SET request_json = '', system_text = NULL, prompt_text = '', input_ref = NULL,
              response_raw = NULL, answer_text = NULL, math_mismatches = NULL, price_verify_url = NULL
        WHERE request_json != '' OR prompt_text != '' OR system_text IS NOT NULL OR input_ref IS NOT NULL
           OR response_raw IS NOT NULL OR answer_text IS NOT NULL`,
    )
    .run();
  return Number(r.changes);
}

/** Device-only records idle for 24 months, in the scan database. Returns how many rows went. */
function deleteIdleDeviceRecords(db: DatabaseSync, cutoff: string, failed: string[]): number {
  const have = (t: string) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t) !== undefined;
  const active = ACTIVITY_TABLES.filter((a) => have(a.table));
  let deleted = 0;
  for (const { table, at } of DEVICE_RECORD_TABLES) {
    try {
      if (!have(table)) continue;
      const unused = active.map((a) => `AND NOT EXISTS (SELECT 1 FROM ${a.table} a WHERE a.device_id = ${table}.device_id AND a.${a.at} >= @cutoff)`).join(' ');
      const r = db.prepare(`DELETE FROM ${table} WHERE ${at} < @cutoff ${unused}`).run({ cutoff });
      deleted += Number(r.changes);
    } catch (err) {
      failed.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return deleted;
}

/**
 * The beta testers' list (people.db, one row per device and the name of the link it came through) is
 * a table of device ids with a person's label beside each. A row not seen for 24 months is deleted.
 */
export function sweepPeople(now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): { deleted: number; failed: string | null } {
  const path = peoplePath(env);
  if (!existsSync(path)) return { deleted: 0, failed: null };
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(path);
    db.exec('PRAGMA busy_timeout = 5000');
    const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'device_person'").get();
    if (!has) return { deleted: 0, failed: null };
    const r = db.prepare('DELETE FROM device_person WHERE last_seen < ?').run(monthsBefore(now, DEVICE_ID_MONTHS));
    return { deleted: Number(r.changes), failed: null };
  } catch (err) {
    return { deleted: 0, failed: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      db?.close();
    } catch {
      /* closed or never opened */
    }
  }
}

/**
 * The shopper-typed shelf prices in the user catalogue (`user_observation`) carry a device key and a
 * network code. Past 24 months they lose both, like the scan tables: the price stays, the phone goes.
 * `path` is the catalogue file; a file that is not there has nothing to sweep.
 */
export function sweepUserCatalogue(path: string, now: Date = new Date()): { removed: number; failed: string | null } {
  if (!existsSync(path)) return { removed: 0, failed: null };
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(path);
    db.exec('PRAGMA busy_timeout = 5000');
    const cols = (db.prepare('PRAGMA table_info(user_observation)').all() as unknown as { name: string }[]).map((c) => c.name);
    if (!cols.includes('device_key')) return { removed: 0, failed: null };
    const net = cols.includes('net_hash') ? ', net_hash = NULL' : '';
    const r = db
      .prepare(
        `UPDATE user_observation SET device_key = '${REMOVED_PREFIX}' || id${net}
          WHERE observed_at < ? AND device_key IS NOT NULL AND device_key NOT LIKE '${REMOVED_PREFIX}%'`,
      )
      .run(monthsBefore(now, DEVICE_ID_MONTHS));
    return { removed: Number(r.changes), failed: null };
  } catch (err) {
    return { removed: 0, failed: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      db?.close();
    } catch {
      /* closed or never opened */
    }
  }
}

/**
 * The safety copies made when rows were deleted by hand (`<data dir>/deleted`: a copy of the database
 * and the removed rows, as files). Kept at most SAFETY_COPY_DAYS days by the file's own modified time.
 */
export function sweepSafetyCopies(dir: string, now: Date = new Date()): { deleted: number; failed: string | null } {
  if (!existsSync(dir)) return { deleted: 0, failed: null };
  const cutoff = now.getTime() - SAFETY_COPY_DAYS * DAY_MS;
  let deleted = 0;
  try {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const st = statSync(file);
      if (st.mtimeMs < cutoff) {
        rmSync(file, { recursive: true, force: true });
        deleted += 1;
      }
    }
    return { deleted, failed: null };
  } catch (err) {
    return { deleted, failed: err instanceof Error ? err.message : String(err) };
  }
}

/** The folder the safety copies sit in: `deleted` beside the scan database. */
export function safetyCopyDir(): string {
  const store = activeScanStore();
  const scans = store?.path ?? settings.SHIN_SCANS() ?? 'data/scans.db';
  return join(dirname(resolve(scans)), 'deleted');
}

/** The usage-event and device-id parts, on the scan database. */
export function sweepScanData(now: Date = new Date()): ScanRetentionResult {
  const store = activeScanStore() ?? openScanStore();
  const failed: string[] = [];
  let eventsDeleted = 0;
  let deviceIdsRemoved = 0;
  if (!store.db) return { eventsDeleted, deviceIdsRemoved, deviceRecordsDeleted: 0, geminiBodiesCleared: 0, failed: [store.droppedWhy || 'scan store is not open'] };
  try {
    const r = store.db.prepare('DELETE FROM event WHERE created_at < ?').run(monthsBefore(now, USAGE_EVENT_MONTHS));
    eventsDeleted = Number(r.changes);
  } catch (err) {
    failed.push(`event: ${err instanceof Error ? err.message : String(err)}`);
  }
  const cutoff = monthsBefore(now, DEVICE_ID_MONTHS);
  for (const { table, key, at, also } of DEVICE_TABLES) {
    try {
      const exists = store.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      if (!exists) continue;
      const r = store.db
        .prepare(
          `UPDATE ${table} SET device_id = '${REMOVED_PREFIX}' || ${key}${also ? ', ' + also : ''}
            WHERE ${at} < ? AND device_id IS NOT NULL AND device_id NOT LIKE '${REMOVED_PREFIX}%'`,
        )
        .run(cutoff);
      deviceIdsRemoved += Number(r.changes);
    } catch (err) {
      failed.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const deviceRecordsDeleted = deleteIdleDeviceRecords(store.db, cutoff, failed);
  let geminiBodiesCleared = 0;
  try {
    geminiBodiesCleared = clearGeminiBodies(store.db);
  } catch (err) {
    failed.push(`gemini_call: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { eventsDeleted, deviceIdsRemoved, deviceRecordsDeleted, geminiBodiesCleared, failed };
}

/** The shopper prices' device ids, in the corrections database. `path` is for tests; the server uses the store it has open. */
export function sweepShopperPrices(path?: string, now: Date = new Date()): { removed: number; failed: string | null } {
  try {
    const store = path === undefined ? currentCorrectionStore() : openCorrectionStore(path);
    if (!store.db) return { removed: 0, failed: store.droppedWhy };
    const cutoff = monthsBefore(now, DEVICE_ID_MONTHS);
    // The corrections' own prices, and the prices shoppers typed for products Pexi identified (decisions 2026-11-15).
    return { removed: removeOldDeviceIds(store, cutoff, REMOVED_PREFIX) + removeOldShopperDeviceIds(store.db, cutoff, REMOVED_PREFIX), failed: null };
  } catch (err) {
    return { removed: 0, failed: err instanceof Error ? err.message : String(err) };
  }
}

/** A line's own time, or null for a line that does not carry one. A line with no readable time is kept. */
function lineTime(line: string): number | null {
  try {
    const at = (JSON.parse(line) as { at?: unknown }).at;
    const t = typeof at === 'string' ? Date.parse(at) : Number.NaN;
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Deletes request-log lines older than the window. The file is append-only, so its first line is its
 * oldest: when that is inside the window nothing is read further or rewritten, which is the usual
 * case. Otherwise the kept lines go to a new file that replaces the old one.
 */
export async function sweepRequestLog(
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ deleted: number; failed: string | null }> {
  const path = accessLogPath(env);
  if (!existsSync(path)) return { deleted: 0, failed: null };
  const cutoff = now.getTime() - REQUEST_LOG_DAYS * DAY_MS;
  const temp = `${path}.sweep`;
  try {
    const firstInput = createReadStream(path);
    const first = createInterface({ input: firstInput, crlfDelay: Infinity });
    let oldest: number | null = null;
    let sawLine = false;
    for await (const line of first) {
      sawLine = true;
      oldest = lineTime(line);
      break;
    }
    first.close();
    if (!firstInput.closed) {
      firstInput.destroy();
      await once(firstInput, 'close');
    }
    // An empty file has nothing to sweep. A first line with no readable time proves nothing about the
    // lines behind it (privacy procedures, 2026-11-16): fall through to the full pass, which keeps
    // unreadable lines and drops the old ones, instead of stopping the sweep for good.
    if (!sawLine || (oldest !== null && oldest >= cutoff)) return { deleted: 0, failed: null };

    let deleted = 0;
    const out = createWriteStream(temp);
    const input = createReadStream(path);
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      const t = lineTime(line);
      if (t !== null && t < cutoff) {
        deleted += 1;
        continue;
      }
      if (!out.write(`${line}\n`)) await once(out, 'drain');
    }
    out.end();
    await once(out, 'close');
    if (!input.closed) await once(input, 'close');
    renameSync(temp, path);
    return { deleted, failed: null };
  } catch (err) {
    rmSync(temp, { force: true });
    return { deleted: 0, failed: err instanceof Error ? err.message : String(err) };
  }
}
