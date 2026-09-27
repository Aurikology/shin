/**
 * The weekly free-scan limit, the Plus entitlement that lifts it, and what a
 * shopper did after an answer. MVP plan, "Subscription" and "How the beta is
 * judged" (docs/mvp-plan.md, 2026-09-21).
 *
 * THE LIMIT IS OFF UNLESS IT IS SET. Every push to main deploys to the live
 * beta server, and the testers on it use the web app with no way to
 * subscribe. So `SHIN_FREE_SCANS_PER_WEEK` unset, empty, 0 or not a number
 * means no limit and no 402, ever. Only a positive whole number turns it on.
 *
 * WHAT COUNTS. A barcode scan this server answered: `kind = 'barcode'`,
 * `outcome = 'answered'`, no failure class, a name Gemini gave (a barcode row
 * whose Gemini call failed still says 'answered', because its label falls back
 * to the digits, so `resolved_label IS NOT NULL` is what separates a real
 * answer from a miss), not a demo row. A lookup that failed is our failure and
 * never costs the shopper a scan. A scan later marked corrected was wrong and
 * does not count either. Repeat scans served from the cache count: the
 * shopper got an answer.
 *
 * ROLLING 7 DAYS, counted from the scan table itself, so it lives in
 * scans.db beside everything else and survives a reinstall of the SERVER.
 * The device id is the key. That id is random and lives in the phone's local
 * storage (public/js/device.js): reinstalling the APP, clearing site data, or
 * a private window mints a new id and a fresh week. That is the limitation,
 * and closing it needs an id the store holds (RevenueCat's app user id, or a
 * Keychain-backed one), which is the client lane's side.
 *
 * PLUS. With `REVENUECAT_SECRET_KEY` set, the server asks RevenueCat whether
 * this device's app user id holds the `plus` entitlement, and remembers the
 * answer for ten minutes. Without it, the client's `x-shin-plus: 1` header is
 * believed, which is a beta seam and says so once at startup.
 */
import * as settings from '../../settings/src/index.ts';
import type { IncomingHttpHeaders } from 'node:http';
import { activeScanStore, openScanStore } from './scans.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_MS = 7 * DAY_MS;
export const DEVICE_HEADER = 'x-shin-device';
export const PLUS_HEADER = 'x-shin-plus';
export const PLUS_ENTITLEMENT = 'plus';
const ENTITLEMENT_CACHE_MS = 10 * 60 * 1000;
/** A failed RevenueCat call is retried after a minute, not after ten. */
const ENTITLEMENT_ERROR_CACHE_MS = 60 * 1000;

/** The weekly limit, or null when there is none. See the header: unset is off. */
export function freeScanLimit(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (settings.SHIN_FREE_SCANS_PER_WEEK(env) ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function headerText(headers: IncomingHttpHeaders, name: string): string | null {
  const v = headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  const t = typeof s === 'string' ? s.trim() : '';
  return t === '' ? null : t;
}

/** The device id a request names in the `x-shin-device` header, or null. */
export function deviceFromHeaders(headers: IncomingHttpHeaders): string | null {
  return headerText(headers, DEVICE_HEADER);
}

export interface Usage {
  readonly used: number;
  /**
   * When the next free scan comes back, as ISO time, or null when nothing in
   * the window has been used. Over the limit it is the moment enough of the
   * oldest scans age out for one more; under it, when the oldest ages out.
   */
  readonly resetsAt: string | null;
}

/** This device's counted scans over the rolling seven days. Never throws; a store that cannot be read counts 0. */
export function usageFor(deviceId: string, limit: number | null, now: Date = new Date()): Usage {
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) return { used: 0, resetsAt: null };
    const since = new Date(now.getTime() - WINDOW_MS).toISOString();
    const rows = store.db
      .prepare(
        `SELECT scanned_at FROM scan
          WHERE device_id = ? AND kind = 'barcode' AND outcome = 'answered'
            AND failure_class IS NULL AND resolved_label IS NOT NULL AND is_demo = 0
            AND scanned_at >= ?
          ORDER BY scanned_at ASC`,
      )
      .all(deviceId, since) as unknown as { scanned_at: string }[];
    const used = rows.length;
    if (used === 0) return { used, resetsAt: null };
    // Over the limit, used - limit + 1 scans must age out before one is free.
    const index = limit !== null && used >= limit ? used - limit : 0;
    const frees = new Date(Date.parse(rows[index].scanned_at) + WINDOW_MS).toISOString();
    return { used, resetsAt: frees };
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return { used: 0, resetsAt: null };
  }
}

/* ----------------------------------------------------------- entitlement */

type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

let fetchForEntitlement: FetchLike | null = null;
const entitlementCache = new Map<string, { plus: boolean; until: number }>();

/** Tests hand in a fake RevenueCat. Null puts the real fetch back. Clears the cache either way. */
export function setEntitlementFetchForTests(f: FetchLike | null): void {
  fetchForEntitlement = f;
  entitlementCache.clear();
}

export type EntitlementMode = 'revenuecat' | 'client_trusted';

export function entitlementMode(env: NodeJS.ProcessEnv = process.env): EntitlementMode {
  return (settings.REVENUECAT_SECRET_KEY(env) ?? '').trim() ? 'revenuecat' : 'client_trusted';
}

/** The one startup line, or null when RevenueCat is doing the checking. */
export function entitlementStartupWarning(env: NodeJS.ProcessEnv = process.env): string | null {
  return entitlementMode(env) === 'client_trusted'
    ? 'WARNING: REVENUECAT_SECRET_KEY is not set, so Shin Plus is whatever the phone says it is (x-shin-plus: 1). Beta only.'
    : null;
}

/** True when RevenueCat's subscriber record holds an unexpired `plus`. */
export function entitlementActive(body: unknown, now: Date = new Date()): boolean {
  const ent = (body as { subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> } })
    ?.subscriber?.entitlements?.[PLUS_ENTITLEMENT];
  if (!ent || typeof ent !== 'object') return false;
  // A lifetime entitlement has no expiry.
  if (ent.expires_date === null || ent.expires_date === undefined) return true;
  const t = Date.parse(ent.expires_date);
  return Number.isFinite(t) && t > now.getTime();
}

/**
 * Whether this device is Plus. Never throws. A RevenueCat outage answers with
 * the last known answer for this device if there is one, else not Plus.
 */
export async function isPlus(
  deviceId: string,
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<boolean> {
  if (entitlementMode(env) === 'client_trusted') return headerText(headers, PLUS_HEADER) === '1';
  const cached = entitlementCache.get(deviceId);
  if (cached && cached.until > now.getTime()) return cached.plus;
  const key = (settings.REVENUECAT_SECRET_KEY(env) ?? '').trim();
  const doFetch: FetchLike = fetchForEntitlement ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const res = await doFetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceId)}`, {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`RevenueCat answered ${res.status}`);
    const plus = entitlementActive(await res.json(), now);
    entitlementCache.set(deviceId, { plus, until: now.getTime() + ENTITLEMENT_CACHE_MS });
    return plus;
  } catch {
    const plus = cached?.plus ?? false;
    entitlementCache.set(deviceId, { plus, until: now.getTime() + ENTITLEMENT_ERROR_CACHE_MS });
    return plus;
  }
}

/* ----------------------------------------------------------------- quota */

export interface Quota {
  readonly limit: number | null;
  readonly used: number;
  readonly remaining: number | null;
  readonly resetsAt: string | null;
  readonly plus: boolean;
}

/** What `GET /api/quota` serves. `limit` and `remaining` are null when there is no limit (off, or Plus). */
export async function quotaFor(
  deviceId: string,
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<Quota> {
  const plus = await isPlus(deviceId, headers, env, now);
  const limit = plus ? null : freeScanLimit(env);
  const { used, resetsAt } = usageFor(deviceId, limit, now);
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used), resetsAt, plus };
}

export interface ScanLimitRefusal {
  readonly error: 'scan_limit';
  readonly limit: number;
  readonly used: number;
  readonly resetsAt: string | null;
}

/**
 * The 402 body when this device has used its week and is not Plus, else null.
 * Called before any Gemini call. With the limit off it returns null without
 * touching RevenueCat or the database.
 */
export async function scanLimitRefusal(
  deviceId: string,
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<ScanLimitRefusal | null> {
  const limit = freeScanLimit(env);
  if (limit === null) return null;
  const { used, resetsAt } = usageFor(deviceId, limit, now);
  if (used < limit) return null;
  if (await isPlus(deviceId, headers, env, now)) return null;
  return { error: 'scan_limit', limit, used, resetsAt };
}

/* --------------------------------------------------------------- outcome */

export const SCAN_OUTCOMES = ['bought_elsewhere', 'price_matched', 'bought_here', 'not_bought'] as const;
export type ScanActOutcome = (typeof SCAN_OUTCOMES)[number];

export function isScanOutcome(v: unknown): v is ScanActOutcome {
  return typeof v === 'string' && (SCAN_OUTCOMES as readonly string[]).includes(v);
}

/*
 * Its own table, created here rather than as a numbered migration, so this
 * lane's change does not race another lane's migration number. One row per
 * scan, the latest answer; `IF NOT EXISTS` makes it the same on every open.
 */
const OUTCOME_DDL = `CREATE TABLE IF NOT EXISTS scan_act_outcome (
  scan_id    INTEGER PRIMARY KEY,
  device_id  TEXT,
  outcome    TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

/** Stores what the shopper did after this scan's answer. Never throws; false when it could not be written. */
export function recordScanOutcome(
  scanId: number,
  deviceId: string | null,
  outcome: ScanActOutcome,
  now: Date = new Date(),
): boolean {
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) return false;
    store.db.exec(OUTCOME_DDL);
    store.db
      .prepare(
        `INSERT INTO scan_act_outcome (scan_id, device_id, outcome, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(scan_id) DO UPDATE SET device_id = excluded.device_id, outcome = excluded.outcome, updated_at = excluded.updated_at`,
      )
      .run(scanId, deviceId, outcome, now.toISOString());
    return true;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/** The stored outcome for a scan, or null. */
export function outcomeFor(scanId: number): { outcome: ScanActOutcome; deviceId: string | null; updatedAt: string } | null {
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) return null;
    store.db.exec(OUTCOME_DDL);
    const row = store.db
      .prepare('SELECT outcome, device_id, updated_at FROM scan_act_outcome WHERE scan_id = ?')
      .get(scanId) as unknown as { outcome: ScanActOutcome; device_id: string | null; updated_at: string } | undefined;
    return row ? { outcome: row.outcome, deviceId: row.device_id, updatedAt: row.updated_at } : null;
  } catch {
    return null;
  }
}
