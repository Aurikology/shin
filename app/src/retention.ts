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
import { createReadStream, createWriteStream, existsSync, renameSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { accessLogPath } from './access-log.ts';
import { activeScanStore, openScanStore } from './scans.ts';
import { currentCorrectionStore, openCorrectionStore, removeOldDeviceIds } from '../../price/src/corrections.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export const REQUEST_LOG_DAYS = 90;
export const USAGE_EVENT_MONTHS = 12;
export const DEVICE_ID_MONTHS = 24;

/** The mark a device id is replaced with. Migration 21's triggers allow this edit and no other. */
export const REMOVED_PREFIX = 'removed:';

function monthsBefore(now: Date, months: number): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

/** Every table with a device id on a row about a scan, and the time column that dates the row. */
const DEVICE_TABLES: readonly { table: string; key: string; at: string }[] = [
  { table: 'scan', key: 'id', at: 'scanned_at' },
  { table: 'scan_rating', key: 'scan_id', at: 'rated_at' },
  { table: 'scan_rating_history', key: 'id', at: 'rated_at' },
  { table: 'scan_pick', key: 'id', at: 'picked_at' },
  { table: 'scan_later_answer', key: 'id', at: 'recorded_at' },
  { table: 'scan_act_outcome', key: 'scan_id', at: 'updated_at' },
  { table: 'gemini_call', key: 'id', at: 'requested_at' },
];

export interface ScanRetentionResult {
  readonly eventsDeleted: number;
  readonly deviceIdsRemoved: number;
  readonly failed: readonly string[];
}

/** The usage-event and device-id parts, on the scan database. */
export function sweepScanData(now: Date = new Date()): ScanRetentionResult {
  const store = activeScanStore() ?? openScanStore();
  const failed: string[] = [];
  let eventsDeleted = 0;
  let deviceIdsRemoved = 0;
  if (!store.db) return { eventsDeleted, deviceIdsRemoved, failed: [store.droppedWhy || 'scan store is not open'] };
  try {
    const r = store.db.prepare('DELETE FROM event WHERE created_at < ?').run(monthsBefore(now, USAGE_EVENT_MONTHS));
    eventsDeleted = Number(r.changes);
  } catch (err) {
    failed.push(`event: ${err instanceof Error ? err.message : String(err)}`);
  }
  const cutoff = monthsBefore(now, DEVICE_ID_MONTHS);
  for (const { table, key, at } of DEVICE_TABLES) {
    try {
      const exists = store.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      if (!exists) continue;
      const r = store.db
        .prepare(
          `UPDATE ${table} SET device_id = '${REMOVED_PREFIX}' || ${key}
            WHERE ${at} < ? AND device_id IS NOT NULL AND device_id NOT LIKE '${REMOVED_PREFIX}%'`,
        )
        .run(cutoff);
      deviceIdsRemoved += Number(r.changes);
    } catch (err) {
      failed.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { eventsDeleted, deviceIdsRemoved, failed };
}

/** The shopper prices' device ids, in the corrections database. `path` is for tests; the server uses the store it has open. */
export function sweepShopperPrices(path?: string, now: Date = new Date()): { removed: number; failed: string | null } {
  try {
    const store = path === undefined ? currentCorrectionStore() : openCorrectionStore(path);
    if (!store.db) return { removed: 0, failed: store.droppedWhy };
    return { removed: removeOldDeviceIds(store, monthsBefore(now, DEVICE_ID_MONTHS), REMOVED_PREFIX), failed: null };
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
    for await (const line of first) {
      oldest = lineTime(line);
      break;
    }
    first.close();
    if (!firstInput.closed) {
      firstInput.destroy();
      await once(firstInput, 'close');
    }
    if (oldest === null || oldest >= cutoff) return { deleted: 0, failed: null };

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
