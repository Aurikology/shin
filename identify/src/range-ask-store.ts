/**
 * The persisted state behind `range-ask.ts`: a count of range asks per UTC
 * calendar month, and a 30-day cache of the answers those asks produced.
 *
 * WHY NOT `cap.ts`. `cap.ts` counts CAD per UTC day in a `{ day, cad }` file;
 * it cannot count calls per month without editing it, and this lane may not.
 * So this is a sibling store written the same way: one small JSON file under
 * `identify/data/` (gitignored), created on first use, read fresh on every
 * check so a restart keeps the count. Two differences from `cap.ts`, both on
 * purpose:
 *   - writes go to a temp file and are renamed over the real one, so a crash
 *     mid-write leaves the old file whole rather than a torn one;
 *   - a store that cannot be parsed still reads as empty (never a crash, the
 *     same choice `cap.ts` makes), which means a corrupted file forgives at most
 *     one month's cap. That is written down here rather than hidden.
 *
 * FILE SHAPE (version 1):
 *   {
 *     "version": 1,
 *     "month": "2026-09",            // UTC calendar month the count belongs to
 *     "calls": 12,                   // asks SENT this month, success or not
 *     "cache": {
 *       "<key>": { "askedAt": "<ISO time of the call>", "range": { ...TypicalRange } }
 *     }
 *   }
 * The cache survives a month turning over; only `calls` resets. Entries past
 * their 30 days are pruned whenever the file is written.
 *
 * EVERY ANSWER IS SAVED AS DATA (RULINGS "Catalogue first; Claude, with no web
 * search, is the capped price-range fallback"). Beside the store, an
 * append-only JSON-lines file (`<store>.answers.jsonl`, see
 * `rangeAnswersPath`) gets one line per answer the model gave: valid ranges,
 * `known: false`, and answers refused by the validator, each with its reason
 * and the raw object. A transport failure (no answer came back) is written
 * too, as outcome `transport_error`: requirement 6.2 is one row per call, and
 * a call with no row is the defect. This log is append-only, never pruned and never read back by
 * the ask; the cache above is what saves a rescan its cap slot.
 *
 * Single process, single event loop: the read-modify-write below is not
 * atomic across processes, the same limit `cap.ts` states for itself.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where the store lives unless a caller names another path. */
export const DEFAULT_RANGE_STORE_PATH = join(REPO_ROOT, 'identify', 'data', 'range-ask.json');

export interface CachedRangeEntry {
  /** ISO time of the call that produced this answer. Kept with the answer (RULINGS "Caching and cancellation"). */
  readonly askedAt: string;
  /** The validated range as it was returned; `range-ask.ts` owns its shape. */
  readonly range: Record<string, unknown>;
}

export interface RangeStoreState {
  readonly version: 1;
  readonly month: string;
  readonly calls: number;
  readonly cache: Readonly<Record<string, CachedRangeEntry>>;
}

/** `YYYY-MM` in UTC. Not local time: two machines have to agree on when the month turns. */
export function utcMonth(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

function empty(month: string): RangeStoreState {
  return { version: 1, month, calls: 0, cache: {} };
}

function isEntry(v: unknown): v is CachedRangeEntry {
  if (v === null || typeof v !== 'object') return false;
  const e = v as { askedAt?: unknown; range?: unknown };
  return typeof e.askedAt === 'string' && !Number.isNaN(Date.parse(e.askedAt)) && e.range !== null && typeof e.range === 'object';
}

/**
 * Reads the store as of `nowMs`. A missing or unparseable file reads as empty.
 * A file from an earlier month keeps its cache and reads with `calls: 0`.
 */
export function readRangeStore(storePath: string, nowMs: number): RangeStoreState {
  const month = utcMonth(nowMs);
  if (!existsSync(storePath)) return empty(month);
  let parsed: Partial<{ month: unknown; calls: unknown; cache: unknown }>;
  try {
    parsed = JSON.parse(readFileSync(storePath, 'utf8')) as typeof parsed;
  } catch {
    return empty(month);
  }
  const cache: Record<string, CachedRangeEntry> = {};
  if (parsed.cache !== null && typeof parsed.cache === 'object') {
    for (const [k, v] of Object.entries(parsed.cache as Record<string, unknown>)) {
      if (isEntry(v)) cache[k] = v;
    }
  }
  const calls =
    parsed.month === month && typeof parsed.calls === 'number' && Number.isFinite(parsed.calls) && parsed.calls >= 0
      ? Math.floor(parsed.calls)
      : 0;
  return { version: 1, month, calls, cache };
}

function writeRangeStore(storePath: string, state: RangeStoreState, nowMs: number, ttlMs: number): void {
  const cache: Record<string, CachedRangeEntry> = {};
  for (const [k, v] of Object.entries(state.cache)) {
    if (nowMs - Date.parse(v.askedAt) < ttlMs) cache[k] = v;
  }
  mkdirSync(dirname(storePath), { recursive: true });
  const tmp = `${storePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...state, cache }), 'utf8');
  renameSync(tmp, storePath);
}

/** How many asks have been sent this UTC month. */
export function monthlyRangeCalls(storePath: string, nowMs: number): { month: string; calls: number } {
  const s = readRangeStore(storePath, nowMs);
  return { month: s.month, calls: s.calls };
}

/**
 * Counts one ask against this month BEFORE it is sent, or refuses it.
 * At or over `limit`: `allowed: false`, nothing written. Otherwise the new
 * count is on disk before the caller is told to go, so a crash mid-call still
 * counted the attempt.
 */
export function reserveMonthlyRangeCall(
  storePath: string,
  limit: number,
  nowMs: number,
  ttlMs: number,
): { allowed: boolean; month: string; calls: number } {
  const s = readRangeStore(storePath, nowMs);
  if (s.calls >= limit) return { allowed: false, month: s.month, calls: s.calls };
  const next: RangeStoreState = { ...s, calls: s.calls + 1 };
  writeRangeStore(storePath, next, nowMs, ttlMs);
  return { allowed: true, month: next.month, calls: next.calls };
}

/** The cached entry for `key`, or null when absent or older than `ttlMs`. */
export function readCachedRange(storePath: string, key: string, nowMs: number, ttlMs: number): CachedRangeEntry | null {
  const entry = readRangeStore(storePath, nowMs).cache[key];
  if (!entry) return null;
  const age = nowMs - Date.parse(entry.askedAt);
  return age >= 0 && age < ttlMs ? entry : null;
}

/** Stores one answer. Re-reads first, so a count reserved since the last read is kept. */
export function writeCachedRange(storePath: string, key: string, entry: CachedRangeEntry, nowMs: number, ttlMs: number): void {
  const s = readRangeStore(storePath, nowMs);
  writeRangeStore(storePath, { ...s, cache: { ...s.cache, [key]: entry } }, nowMs, ttlMs);
}

/**
 * One row of the estimates log (requirement 6.2): ONE per Claude call that was
 * sent, including calls that got no answer. Item, model, date and category are
 * the four fields the requirement names; `key` is the cache key.
 */
export interface RangeAnswerRecord {
  readonly key: string;
  /** The item asked about, as named in the ask. */
  readonly item: string;
  readonly brand?: string | null;
  readonly size?: string | null;
  /** The category the ask carried, or null when the caller passed none. Always present. */
  readonly category: string | null;
  /** ISO time of the call. */
  readonly askedAt: string;
  /** The model that answered; for a call that got no answer, the model that was asked. */
  readonly model: string;
  /** 'ok', 'model_does_not_know', the validator's refusal reason, or 'transport_error' (no answer came back). */
  readonly outcome: string;
  readonly detail?: string;
  /** The model's parsed object, or null when it did not parse or never answered. */
  readonly raw: unknown;
}

/** The answer log beside `storePath`: `range-ask.json` -> `range-ask.answers.jsonl`. */
export function rangeAnswersPath(storePath: string): string {
  return storePath.replace(/\.json$/i, '') + '.answers.jsonl';
}

/**
 * Appends one row to the log. Throws on a write failure. APPEND-ONLY: this file
 * is only ever opened with appendFileSync; nothing here rewrites, truncates or
 * deletes a row (test/range-estimates.test.ts proves it).
 */
export function appendRangeAnswer(storePath: string, record: RangeAnswerRecord): void {
  const path = rangeAnswersPath(storePath);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf8');
}

let logFaults = 0;

/** How many estimates-log writes have failed in this process. Surfaced for health checks. */
export function rangeLogFaults(): number {
  return logFaults;
}

/** The fixed tag every log-write fault carries on stderr (RULINGS "Errors never go unnoticed"). */
export const RANGE_LOG_FAULT_TAG = '[range-log-fault]';

/**
 * Appends a row; on failure the fault is counted and logged under
 * `RANGE_LOG_FAULT_TAG`, never swallowed, and false is returned so the caller
 * can flag its result. The shopper's answer is not withheld ("Always answer").
 */
export function recordRangeAnswer(storePath: string, record: RangeAnswerRecord): boolean {
  try {
    appendRangeAnswer(storePath, record);
    return true;
  } catch (err) {
    logFaults += 1;
    console.error(
      `${RANGE_LOG_FAULT_TAG} the estimate row was not stored (fault ${logFaults}): item=${JSON.stringify(record.item)} outcome=${record.outcome} - ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
