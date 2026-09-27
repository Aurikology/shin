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
 * Single process, single event loop: the read-modify-write below is not
 * atomic across processes, the same limit `cap.ts` states for itself.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
