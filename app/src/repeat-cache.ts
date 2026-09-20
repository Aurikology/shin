/**
 * The repeat-scan cache: a second scan of a barcode Shin has already asked
 * Gemini about is answered from what Gemini already said, not with a second
 * paid call.
 *
 * ITEM 1 (docs/scanner-build-order-2026-09-19.md, section 1). Ruling 1
 * (docs/decisions.md, "Nine rulings so the competitor-survey build could
 * start", 2026-09-19), verbatim on what this file has to do:
 *
 *   "A cached Gemini answer is Gemini's answer, not Shin's price. ... So:
 *   identity is cached with no expiry (a barcode's identity does not
 *   change), the price is cached for six hours and always shown with when
 *   it was checked, and a hit older than one hour triggers a background
 *   refresh. Cache key is the barcode plus market and currency, because the
 *   same barcode in another market is a different answer."
 *
 * WHAT THIS IS NOT. `app/server.ts` already has an in-memory `scanned` Map,
 * `SCANNED_TTL_MS = 30 * 60_000`, keyed by device, that bridges one
 * `/api/identify` call to the `/api/price` call that follows it inside the
 * SAME scan. That map still exists and still does that one job: it is a
 * per-request-pair handoff, not a repeat-scan cache, and item 1's own build
 * notes say so explicitly ("used only to bridge /api/identify to /api/price
 * inside one scan session, not to skip a fresh Gemini call on a later repeat
 * scan"). THIS file is the new thing: a cache keyed by PRODUCT, not device,
 * that survives a restart and is what a second scan -- by the same device or
 * a different one, minutes or days later -- is served from.
 *
 * TWO AGES, ONE POLICY, because one Gemini call already returns identity,
 * price and reviews together (rule 1: never two calls) -- there is no
 * separate "identity-only" response this file could ask for on its own.
 * Rather than let the price look older than 6 hours to a person while
 * claiming a fresh identity, every hit under 6 hours is served whole, with
 * `checkedAt` always carried so a caller can show it. Two hours trigger two
 * different actions:
 *
 *   - past 1 hour: still served, but a background refresh is kicked off (at
 *     most one in flight per key at a time, `markRefreshing`), so the common
 *     case never asks a person to wait on staleness they cannot see yet.
 *   - past 6 hours: NOT served. A hit this old means the 1-hour background
 *     refresh has not landed for five hours straight (Gemini down, or a
 *     process that never got to run one), and continuing to serve it would
 *     be exactly "the price should not come from us" with extra steps. The
 *     caller falls through to an ordinary synchronous call, the same one a
 *     first-ever scan of this barcode makes, and its answer overwrites the
 *     cache (both the identity and the price, since one call is both).
 *
 * That is the sense in which identity is cached "with no expiry": nothing
 * here ever treats identity as stale on its own, invalidates it on a timer,
 * or asks Gemini again just because time passed. The 6-hour ceiling exists
 * only as a bound on how stale a PRICE can ever get in front of a person, not
 * as a claim that the product identity became wrong.
 *
 * PERSISTENT, deliberately its own file rather than a table shoehorned into
 * `scans.db`: it follows `catalogue/src/gaps.ts`'s and `app/src/scans.ts`'s
 * own shape (a standalone SQLite file, opened read-write lazily, created if
 * missing, and never throwing). A cache that is lost on every restart is a
 * cache in name only; that is exactly what the OLD in-memory `scanned` Map
 * is, for the job THIS file exists to do instead.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** The price is never served past this age; see the file header. */
export const PRICE_MAX_AGE_MS = 6 * 60 * 60_000;
/** Past this age (and under the ceiling above) a hit still answers, but a background refresh is due. */
export const REFRESH_AFTER_MS = 60 * 60_000;

const DDL = `
CREATE TABLE IF NOT EXISTS scan_cache (
  cache_key         TEXT PRIMARY KEY,
  gtin              TEXT NOT NULL,
  market            TEXT,
  currency          TEXT,
  run_json          TEXT NOT NULL,
  block_json        TEXT NOT NULL,
  scan_id           INTEGER,
  checked_at        TEXT NOT NULL,
  refreshing        INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX IF NOT EXISTS scan_cache_gtin ON scan_cache(gtin);
`;

export interface RepeatCacheStore {
  readonly path: string;
  readonly db: DatabaseSync | null;
  dropped: number;
  droppedWhy: string;
}

let active: RepeatCacheStore | null = null;

export function activeRepeatCache(): RepeatCacheStore | null {
  return active;
}

/** Never throws. A store that cannot open comes back with `db: null`, counted like any other drop. */
export function openRepeatCache(path: string = process.env.SHIN_REPEAT_CACHE ?? 'data/repeat-cache.db'): RepeatCacheStore {
  let db: DatabaseSync | null = null;
  let droppedWhy = '';
  try {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path);
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(DDL);
  } catch (err) {
    db = null;
    droppedWhy = err instanceof Error ? err.message : String(err);
  }
  const store: RepeatCacheStore = { path, db, dropped: 0, droppedWhy };
  active = store;
  return store;
}

/**
 * Cache key: the barcode plus market and currency, exactly as ruling 1
 * states it. A barcode with no market/currency sent (an older client, or a
 * market Shin could not resolve) still gets a key; it is simply a key that
 * only matches other requests that also sent none.
 */
export function repeatCacheKey(gtin: string, market: string | null | undefined, currency: string | null | undefined): string {
  const digits = gtin.replace(/\D/g, '');
  return `${digits}|${market ?? ''}|${currency ?? ''}`;
}

export interface CacheHit<Run, Block> {
  readonly run: Run;
  readonly block: Block;
  readonly scanId: number | null;
  readonly checkedAt: string;
  /** Past `REFRESH_AFTER_MS`. The caller should kick off a background refresh. */
  readonly needsRefresh: boolean;
}

/**
 * A hit under the 6-hour ceiling, or null (a miss, or a hit too old to
 * serve -- the caller cannot tell those two apart from this return value
 * alone, and does not need to: both mean "make the call").
 *
 * Never throws.
 */
export function recallCachedScan<Run = unknown, Block = unknown>(
  gtin: string,
  market: string | null | undefined,
  currency: string | null | undefined,
  now: Date = new Date(),
): CacheHit<Run, Block> | null {
  const store = active ?? openRepeatCache();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'repeat cache is not open');
    const key = repeatCacheKey(gtin, market, currency);
    const row = store.db
      .prepare('SELECT run_json, block_json, scan_id, checked_at FROM scan_cache WHERE cache_key = ?')
      .get(key) as unknown as { run_json: string; block_json: string; scan_id: number | null; checked_at: string } | undefined;
    if (!row) return null;
    const age = now.getTime() - Date.parse(row.checked_at);
    if (!Number.isFinite(age) || age >= PRICE_MAX_AGE_MS) return null;
    return {
      run: JSON.parse(row.run_json) as Run,
      block: JSON.parse(row.block_json) as Block,
      scanId: row.scan_id,
      checkedAt: row.checked_at,
      needsRefresh: age >= REFRESH_AFTER_MS,
    };
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return null;
  }
}

/**
 * Writes (or overwrites) the cached answer for a barcode plus market and
 * currency. Called after every real Gemini call that answered a barcode
 * scan, cache hit or not, so the entry's `checked_at` always reflects the
 * most recent real answer.
 *
 * Never throws.
 */
export function rememberCachedScan(
  gtin: string,
  market: string | null | undefined,
  currency: string | null | undefined,
  run: unknown,
  block: unknown,
  scanId: number | null,
  now: Date = new Date(),
): void {
  const store = active ?? openRepeatCache();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'repeat cache is not open');
    const key = repeatCacheKey(gtin, market, currency);
    store.db
      .prepare(
        `INSERT INTO scan_cache (cache_key, gtin, market, currency, run_json, block_json, scan_id, checked_at, refreshing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(cache_key) DO UPDATE SET
           run_json = excluded.run_json,
           block_json = excluded.block_json,
           scan_id = excluded.scan_id,
           checked_at = excluded.checked_at,
           refreshing = 0`,
      )
      .run(key, gtin.replace(/\D/g, ''), market ?? null, currency ?? null, JSON.stringify(run), JSON.stringify(block), scanId, now.toISOString());
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Claims the right to run the one background refresh for a key. Returns
 * true only for the caller that flips `refreshing` from 0 to 1, so two scans
 * of the same stale barcode arriving close together schedule exactly one
 * refresh between them rather than one each.
 *
 * Never throws; a store that cannot be reached refuses the claim (false),
 * which just means no background refresh runs this time -- the next hit
 * tries again, and nothing about the served answer depends on this.
 */
export function claimRefresh(gtin: string, market: string | null | undefined, currency: string | null | undefined): boolean {
  const store = active ?? openRepeatCache();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'repeat cache is not open');
    const key = repeatCacheKey(gtin, market, currency);
    const result = store.db
      .prepare('UPDATE scan_cache SET refreshing = 1 WHERE cache_key = ? AND refreshing = 0')
      .run(key);
    return Number(result.changes) > 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * Releases a claim taken by `claimRefresh` without writing a fresh answer,
 * so a refresh that threw (the transport failed, the process is shutting
 * down) does not leave a key stuck at `refreshing = 1` forever, which would
 * silently stop every future hit from ever trying again.
 *
 * Never throws.
 */
export function releaseRefresh(gtin: string, market: string | null | undefined, currency: string | null | undefined): void {
  const store = active ?? openRepeatCache();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'repeat cache is not open');
    const key = repeatCacheKey(gtin, market, currency);
    store.db.prepare('UPDATE scan_cache SET refreshing = 0 WHERE cache_key = ?').run(key);
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
  }
}

/** Test and inspection helper. Never throws. */
export function allCachedScans(store: RepeatCacheStore): { cache_key: string; scan_id: number | null; checked_at: string }[] {
  if (!store.db) return [];
  return store.db
    .prepare('SELECT cache_key, scan_id, checked_at FROM scan_cache ORDER BY cache_key ASC')
    .all() as unknown as { cache_key: string; scan_id: number | null; checked_at: string }[];
}

/**
 * Test helper only. Empties the cache table without closing the store, so a
 * test file that scans the SAME barcode fixture across many independent
 * `test()` blocks (most of this repo's Gemini-path suite, written before this
 * cache existed) keeps meaning "a fresh scan" in each one, rather than the
 * second block silently being served the first block's cached answer. Item 1's
 * OWN tests, which scan the same barcode twice on purpose to prove the cache
 * works, call this in `before`, not `beforeEach`, so the repeat happens inside
 * one test rather than across the file's reset boundary. Never throws.
 */
export function clearRepeatCacheForTests(): void {
  const store = active ?? openRepeatCache();
  try {
    store.db?.exec('DELETE FROM scan_cache');
  } catch {
    /* nothing cached is nothing to clear */
  }
}
