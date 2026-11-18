/**
 * The weekly free-scan limit, the Plus entitlement that lifts it, and what a
 * shopper did after an answer. MVP plan, "Subscription" and "How the beta is
 * judged" (docs/mvp-plan.md, 2026-09-21).
 *
 * THE LIMIT IS OFF UNLESS IT IS SET. Every push to main deploys to the live
 * beta server, and the testers on it use the web app with no way to
 * subscribe. So `SHIN_FREE_SCANS_PER_WEEK` unset, empty, 0 or not a number
 * means no limit and no 402, ever. Only a positive whole number turns it on.
 * `SHIN_PLUS_SCANS_PER_WEEK` (Jamin 2026-11-05: 100 a week for Plus, 10 for
 * free) works the same way for subscribers, over the same rolling 7 days and
 * with the same counting rules; unset, Plus has no cap.
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
 * storage (public/js/device.js) and, on the iPhone, in the Keychain too (since
 * 2026-11-16, security finding A3): reinstalling the APP keeps the id and the
 * week. Clearing site data on the web or a private window still mints a new id
 * and a fresh week.
 *
 * PLUS. With `REVENUECAT_SECRET_KEY` set, the server asks RevenueCat whether
 * this device's app user id holds the `plus` entitlement, and remembers the
 * answer for ten minutes (R19: sooner when the phone's x-shin-plus hint says
 * the cache is stale, at most once a minute per device; R27: a 3-second
 * timeout, failures counted for /api/health, a subscriber confirmed within a
 * day stays Plus through an outage). Without it nobody is Plus, and the server says so once
 * at startup (Jamin's App Store list, item 1: anyone could claim Plus with
 * `x-shin-plus: 1` while the key was unset). `SHIN_PLUS_TRUST_CLIENT=1` puts the
 * old beta seam back, believing that header, for a machine with no key on purpose.
 */
import * as settings from '../../settings/src/index.ts';
import type { IncomingHttpHeaders } from 'node:http';
import { activeScanStore, openScanStore } from './scans.ts';
import { provesDevice } from './device-key.ts';
import { KeyedLimiter } from './rate-limit.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 7 * DAY_MS;
const DEVICE_HEADER = 'x-shin-device';
const PLUS_HEADER = 'x-shin-plus';
const PLUS_ENTITLEMENT = 'plus';
const ENTITLEMENT_CACHE_MS = 10 * 60 * 1000;
/** A failed RevenueCat call is retried after a minute, not after ten. */
const ENTITLEMENT_ERROR_CACHE_MS = 60 * 1000;
/** A device id RevenueCat may be asked about: letters, digits, underscore and hyphen, 8 to 64 long. */
const PLUS_ID_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;
const lookupLimiter = new KeyedLimiter([{ ms: 60_000, limit: 120 }]);
/** A RevenueCat call that has not answered in this long is a failure (R27); the shopper must not wait on it. */
const ENTITLEMENT_TIMEOUT_MS = 3_000;
/** A phone that says it is Plus while the cache says not may force a re-check, once a minute per device (R19). */
const HINT_RECHECK_MS = 60_000;
/** A subscriber RevenueCat confirmed within this long stays Plus through a RevenueCat outage (R27). */
const PLUS_GRACE_MS = 24 * 60 * 60 * 1000;
/** The on-disk memory of "RevenueCat said yes" is refreshed at most this often per device. */
const PLUS_SEEN_WRITE_MS = 60 * 60 * 1000;
let lookupAlarmAt = 0;

/** A cap setting's value: a positive whole number, else null (no cap). */
function positiveWhole(rawValue: string | undefined): number | null {
  const raw = (rawValue ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The weekly limit, or null when there is none. See the header: unset is off. */
export function freeScanLimit(env: NodeJS.ProcessEnv = process.env): number | null {
  return positiveWhole(settings.SHIN_FREE_SCANS_PER_WEEK(env));
}

/**
 * The weekly cap on Pexi Plus subscribers (Jamin, 2026-11-05: 100 a week), or
 * null when there is none. Read exactly as the free limit is: unset, empty, 0
 * or not a number means no cap, so Plus stays unlimited until it is set.
 */
export function plusScanLimit(env: NodeJS.ProcessEnv = process.env): number | null {
  return positiveWhole(settings.SHIN_PLUS_SCANS_PER_WEEK(env));
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

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

let fetchForEntitlement: FetchLike | null = null;
let entitlementTimeoutMs = ENTITLEMENT_TIMEOUT_MS;
const entitlementCache = new Map<string, { plus: boolean; until: number }>();
/** When a phone's "I am Plus" hint last forced a re-check. */
const hintRecheckAt = new Map<string, number>();
/** When this process last wrote or saw "RevenueCat said plus" for a device. */
const plusSeenAt = new Map<string, number>();

/** Tests hand in a fake RevenueCat. Null puts the real fetch back. Clears the memory (as a restart does) but not the disk. */
export function setEntitlementFetchForTests(f: FetchLike | null): void {
  fetchForEntitlement = f;
  entitlementCache.clear();
  hintRecheckAt.clear();
  plusSeenAt.clear();
}

/** Tests shorten the RevenueCat timeout. Null puts the real one back. */
export function setEntitlementTimeoutForTests(ms: number | null): void {
  entitlementTimeoutMs = ms ?? ENTITLEMENT_TIMEOUT_MS;
}

/*
 * HOW RevenueCat IS DOING, for the health body (R27). Counted since this process started: a restart
 * resets it, and the consecutive-failure streak is what an alarm should read, not the total.
 */
const lookupHealth = {
  lookups: 0,
  failures: 0,
  consecutiveFailures: 0,
  lastFailureAt: null as string | null,
  lastFailure: null as string | null,
  lastSuccessAt: null as string | null,
  limiterRefusals: 0,
};

export interface EntitlementLookupHealth {
  readonly lookups: number;
  readonly failures: number;
  /** Failed lookups in a row since the last success; 0 when the last one worked. */
  readonly consecutiveFailures: number;
  readonly lastFailureAt: string | null;
  readonly lastFailure: string | null;
  readonly lastSuccessAt: string | null;
  /** Lookups skipped because the 120-a-minute ceiling was hit. */
  readonly limiterRefusals: number;
}

/** What /api/health reads: a copy of the RevenueCat lookup counters. */
export function entitlementLookupHealth(): EntitlementLookupHealth {
  return { ...lookupHealth };
}

/** The total the health watch reads (app/src/watch.ts readRevenueCat): it alarms when failures rise fast. */
export function revenueCatHealth(): { failures: number } {
  return { failures: lookupHealth.failures };
}

/** The scan store's own small table of devices RevenueCat confirmed as Plus, so a restart in an outage forgets nobody. */
const PLUS_SEEN_DDL = `CREATE TABLE IF NOT EXISTS plus_seen (
  device_id TEXT PRIMARY KEY,
  seen_at   TEXT NOT NULL
)`;

function rememberPlus(deviceId: string, nowMs: number): void {
  const last = plusSeenAt.get(deviceId);
  if (last !== undefined && nowMs - last < PLUS_SEEN_WRITE_MS) return;
  plusSeenAt.set(deviceId, nowMs);
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) return;
    store.db.exec(PLUS_SEEN_DDL);
    store.db
      .prepare(
        `INSERT INTO plus_seen (device_id, seen_at) VALUES (?, ?)
         ON CONFLICT(device_id) DO UPDATE SET seen_at = excluded.seen_at`,
      )
      .run(deviceId, new Date(nowMs).toISOString());
  } catch {
    // Not remembered this time; the next success tries again. Never costs the shopper anything.
  }
}

/** True when RevenueCat confirmed this device as Plus within the last day (in memory, else on disk). */
function recentlyPlus(deviceId: string, nowMs: number): boolean {
  const mem = plusSeenAt.get(deviceId);
  if (mem !== undefined) return nowMs - mem < PLUS_GRACE_MS;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) return false;
    store.db.exec(PLUS_SEEN_DDL);
    const row = store.db.prepare('SELECT seen_at FROM plus_seen WHERE device_id = ?').get(deviceId) as unknown as
      | { seen_at: string }
      | undefined;
    const t = row ? Date.parse(row.seen_at) : NaN;
    return Number.isFinite(t) && nowMs - t < PLUS_GRACE_MS;
  } catch {
    return false;
  }
}

/** One RevenueCat call that gives up after the timeout, whether it hangs on the connection or on the body. */
async function askRevenueCat(doFetch: FetchLike, deviceId: string, key: string): Promise<unknown> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error(`RevenueCat did not answer in ${entitlementTimeoutMs} ms`));
    }, entitlementTimeoutMs);
  });
  try {
    const call = (async () => {
      const res = await doFetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceId)}`, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`RevenueCat answered ${res.status}`);
      return res.json();
    })();
    call.catch(() => {}); // a call that loses the race must not become an unhandled rejection
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export type EntitlementMode = 'revenuecat' | 'client_trusted';

function trustsClientPlus(env: NodeJS.ProcessEnv): boolean {
  return (settings.SHIN_PLUS_TRUST_CLIENT(env) ?? '').trim() === '1';
}

export function entitlementMode(env: NodeJS.ProcessEnv = process.env): EntitlementMode {
  return (settings.REVENUECAT_SECRET_KEY(env) ?? '').trim() ? 'revenuecat' : 'client_trusted';
}

/** The one startup line, or null when RevenueCat is doing the checking. */
export function entitlementStartupWarning(env: NodeJS.ProcessEnv = process.env): string | null {
  if (entitlementMode(env) !== 'client_trusted') return null;
  return trustsClientPlus(env)
    ? 'WARNING: SHIN_PLUS_TRUST_CLIENT=1 and REVENUECAT_SECRET_KEY is not set, so Pexi Plus is whatever the phone says it is (x-shin-plus: 1). Never on a public server.'
    : 'WARNING: REVENUECAT_SECRET_KEY is not set, so nobody is Pexi Plus on this server, paying subscribers included. Set it before the scan limits go on.';
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
  if (entitlementMode(env) === 'client_trusted') return trustsClientPlus(env) && headerText(headers, PLUS_HEADER) === '1';
  /*
   * RevenueCat is asked only about an id a phone made (a UUID or the like, never dots or slashes,
   * which would change which record the URL names) and only for a request that PROVES that id with
   * its secret. An id nobody has bound is a name anybody can type; asking about it would let a
   * stranger borrow a subscriber's Plus by naming it, and every made-up id would cost a lookup
   * with the secret key (security check A4, A7).
   */
  if (!PLUS_ID_SHAPE.test(deviceId) || !provesDevice(deviceId, headers)) return false;
  const nowMs = now.getTime();
  const cached = entitlementCache.get(deviceId);
  if (cached && cached.until > nowMs) {
    // R19: a shopper who has just paid is cached as "not Plus" for up to ten minutes. The phone knows
    // its own store entitlement and says so with x-shin-plus; that is never believed, only a reason
    // to ask RevenueCat now, at most once a minute per device.
    if (cached.plus || headerText(headers, PLUS_HEADER) !== '1') return cached.plus;
    if (nowMs - (hintRecheckAt.get(deviceId) ?? -Infinity) < HINT_RECHECK_MS) return false;
    hintRecheckAt.set(deviceId, nowMs);
    if (hintRecheckAt.size > 10_000) {
      for (const [id, at] of hintRecheckAt) if (nowMs - at >= HINT_RECHECK_MS) hintRecheckAt.delete(id);
    }
  }
  // A safety valve on the lookups themselves: one process-wide ceiling, so a flood of freshly minted
  // ids cannot turn into a flood of calls to RevenueCat. Over it, the answer is the last known one.
  if (!lookupLimiter.check('revenuecat', nowMs).allowed) {
    lookupHealth.limiterRefusals += 1;
    if (!lookupAlarmAt || nowMs - lookupAlarmAt > 60_000) {
      lookupAlarmAt = nowMs;
      console.warn('[plus-lookup-limit] RevenueCat lookups are over 120 a minute; answering from the last known entitlement until it eases');
    }
    return cached?.plus ?? recentlyPlus(deviceId, nowMs);
  }
  const key = (settings.REVENUECAT_SECRET_KEY(env) ?? '').trim();
  const doFetch: FetchLike = fetchForEntitlement ?? (globalThis.fetch as unknown as FetchLike);
  lookupHealth.lookups += 1;
  try {
    const plus = entitlementActive(await askRevenueCat(doFetch, deviceId, key), now);
    lookupHealth.consecutiveFailures = 0;
    lookupHealth.lastSuccessAt = new Date().toISOString();
    if (plus) rememberPlus(deviceId, nowMs);
    entitlementCache.set(deviceId, { plus, until: nowMs + ENTITLEMENT_CACHE_MS });
    return plus;
  } catch (err) {
    // R27: counted where the health body can read it, and a subscriber RevenueCat confirmed in the
    // last day stays Plus. Retried after a minute, not ten.
    lookupHealth.failures += 1;
    lookupHealth.consecutiveFailures += 1;
    lookupHealth.lastFailureAt = new Date().toISOString();
    lookupHealth.lastFailure = err instanceof Error ? err.message : String(err);
    const plus = (cached?.plus ?? false) || recentlyPlus(deviceId, nowMs);
    entitlementCache.set(deviceId, { plus, until: nowMs + ENTITLEMENT_ERROR_CACHE_MS });
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

/** What `GET /api/quota` serves. `limit` and `remaining` are null when there is no limit (off, or Plus with no cap set). */
export async function quotaFor(
  deviceId: string,
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<Quota> {
  const plus = await isPlus(deviceId, headers, env, now);
  const limit = plus ? plusScanLimit(env) : freeScanLimit(env);
  const { used, resetsAt } = usageFor(deviceId, limit, now);
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used), resetsAt, plus };
}

export interface ScanLimitRefusal {
  readonly error: 'scan_limit';
  readonly limit: number;
  readonly used: number;
  readonly resetsAt: string | null;
  /** True only when the refused device is a Plus subscriber at its own cap: the client shows the used-this-week screen, never the subscribe paywall. */
  readonly plus?: true;
}

/**
 * The 402 body when this device has used its week, else null: a free device
 * at the free limit gets the subscribe paywall's body; a Plus device at the
 * Plus cap gets the same body marked `plus: true`. Called before any Gemini
 * call. With both limits off it returns null without touching RevenueCat or
 * the database, and a device under the smaller set limit never asks RevenueCat.
 */
export async function scanLimitRefusal(
  deviceId: string,
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<ScanLimitRefusal | null> {
  const free = freeScanLimit(env);
  const cap = plusScanLimit(env);
  if (free === null && cap === null) return null;
  const smallest = Math.min(free ?? Infinity, cap ?? Infinity);
  if (usageFor(deviceId, smallest, now).used < smallest) return null;
  const plus = await isPlus(deviceId, headers, env, now);
  const limit = plus ? cap : free;
  if (limit === null) return null;
  const { used, resetsAt } = usageFor(deviceId, limit, now);
  if (used < limit) return null;
  return plus ? { error: 'scan_limit', limit, used, resetsAt, plus: true } : { error: 'scan_limit', limit, used, resetsAt };
}

/* --------------------------------------------------------------- outcome */

const SCAN_OUTCOMES = ['bought_elsewhere', 'price_matched', 'bought_here', 'not_bought'] as const;
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
