/**
 * The ordering: what to price next, and what nothing today can price at all.
 *
 * This file builds no scheduler and runs no daemon. It answers one question,
 * "given the prices we have and the scans people made, what order should a
 * crawler work in", and returns that order plus one more thing that turned
 * out to matter more than the order itself (see THE MAIN RESULT below). The
 * crawler calls into this later; nothing here calls the crawler.
 *
 * PRECEDENCE, as briefed:
 *   1. Scanned, no price at all.        -> real, but see the constraint below.
 *   2. Scanned, has a price.            -> ordered by scan count, most first.
 *   3. Has a price, was not scanned.    -> ordered by staleness, oldest first.
 *
 * WHAT RULE 1 USED TO SAY, AND WHY IT NO LONGER SAYS IT. Until 2026-09-08 this
 * header recorded that a scanned product with no price was unreachable by any
 * crawler, because walmart.ca/robots.txt disallows `/search?*`, the search leg
 * was deleted for it, and the SKU list `crawl.ts` worked from was read back out
 * of its own observation history. The comment ended by naming the fix, the
 * site's own product sitemap, and saying it was not built.
 *
 * It is built now: `price/src/walmart-sitemap.ts`, and `crawl.ts --discover`.
 * The sitemap index publishes about 217,660 first-party product URLs under
 * `/en/ip/*\/*`, which robots.txt explicitly Allows, and each one is confirmed
 * by opening its own page and reading the barcode. So a barcode this system has
 * never priced CAN now be reached, and the reason below is no longer true as
 * written.
 *
 * WHAT REPLACES IT, and it is a different fact, not the same one reworded.
 * Discovery is a walk, not a lookup. There is no per-code query: the sitemap
 * cannot be asked "which SKU is barcode X", it can only be read start to finish
 * until the barcode turns up, and a full first-party pass measures 10.8 days at
 * the rate PerimeterX tolerates (`crawl.ts`'s header carries the arithmetic).
 * The 874 openprices.org rows are still not a crawl target at all: that is a
 * receipt feed contributors upload to, with no per-code query either.
 *
 * So rule 1 still does not go into `toCrawl`, and the reason has moved from
 * "no crawler can reach it" to "no crawler can reach it ON DEMAND". Handing the
 * crawler a bare code would still be handing it something it cannot act on in
 * one request, which is what `toCrawl` promises. What changed is that the list
 * is now actionable by a different mechanism: run discovery, and the barcodes in
 * `scannedNoCrawlerCanReach` become reachable as the walk passes them.
 *
 * THE DISTINCTION IS THE WHOLE POINT OF STILL REPORTING IT. A code in this list
 * is no longer evidence that a seller must be added. It is evidence about how
 * much of the sitemap has been walked, which is a completely different
 * instruction to the person reading it, and collapsing the two would have made
 * this list keep printing "add a seller" on the day the seller was already there.
 *
 * SIZE, so nobody reads a confident-looking queue against numbers it does not
 * have: of 896 rows in `observation`, 22 are walmart.ca, across 21 distinct
 * products (measured 2026-09-05, and audited again 2026-09-08 at 896 rows over
 * 438 distinct products against a 5.18 million row catalogue). That is the
 * entire population `toCrawl`'s rule 2 and rule 3 can reorder for that seller
 * today, and it is the number sitemap discovery exists to move. The other
 * 874 rows, from openprices, are the receipt feed above and are not
 * re-crawlable at all; they can only ever move through `toCrawl` in the sense
 * that their age can be reported, never in the sense that pricing them again
 * is an action this queue can cause to happen.
 *
 * THE SCAN-COUNT SEAM. Scan counts live in a store another lane is building
 * right now at `app/data/scans.db` (`weeklyCount`, a `scans` table). It does
 * not exist yet. This file does not import it and does not wait for it:
 * `options.readScanCounts` is an injected function, defaulting to one that
 * returns an empty map, so this file is complete and testable today and
 * becomes live the moment a caller passes the real reader in. An empty map
 * degrades cleanly to "nothing was scanned", which correctly empties rules 1
 * and 2 and leaves rule 3 (plain staleness) as the whole answer -- exercised
 * in gate 3 below.
 *
 * PER CODE, NOT PER (CODE, SELLER). The brief allowed either. A scan event is
 * a barcode, not a seller: the person who scanned it does not know or care
 * which seller will end up pricing it, and `observation` already lets one
 * code carry rows from several sellers. Returning bare codes also matches
 * `crawl.ts`'s own shape today -- it drives off a code and resolves its own
 * seller SKU (`knownSkus`) -- so this file does not need to know, or guess,
 * which seller a future caller means. Backoff (below) is still computed per
 * code across every seller's attempts, on the same reasoning: a person who
 * scanned a barcode does not want it retried "on this seller" while it sits
 * in a fresh backoff on that seller's own crawl_attempt row.
 *
 * READ ONLY, ALWAYS. This file opens `PRICES_DB_PATH` with
 * `{ readOnly: true }` and never calls `store.ts`'s `openPrices`, because
 * that function runs `CREATE TABLE IF NOT EXISTS` on open, which a read-only
 * connection cannot do and does not need to: a background crawl in another
 * lane may hold the writer side of this same WAL-mode file while this file
 * reads it (`spine/src/sources/observed.ts` opens the same database the same
 * way for the same reason). If the file cannot be opened, or the `observation`
 * table is not there yet, this returns an empty result rather than throwing --
 * the house pattern in `catalogue/src/gaps.ts`: a side query failing must
 * never turn into an exception on someone else's screen.
 *
 * ABSENCE OF SIGNAL IS NOT A ZERO. A `crawl_attempt` row with outcome
 * `throttled` or `error` is never read as "this product has no price"; only
 * the actual rows in `observation` decide that. A failed attempt only ever
 * feeds the backoff below, which delays a retry -- it never manufactures
 * evidence that nothing is there.
 */

import { DatabaseSync } from 'node:sqlite';
import { PRICES_DB_PATH } from './store.ts';

/** Why a code cannot be queued at all today: it is a finding, not a task. */
export interface UnreachableEntry {
  readonly code: string;
  /** From the injected scan reader. */
  readonly scanCount: number;
  readonly reason: string;
}

export type QueueReason = 'scanned_due_for_reprice' | 'stale_unscanned';

/** One code a crawler can actually act on today, and why it is in this order. */
export interface QueueEntry {
  readonly code: string;
  readonly reason: QueueReason;
  readonly scanCount: number;
  readonly priceAgeDays: number;
  readonly intervalDays: number;
  readonly note: string;
}

/** A code held out of `toCrawl` this run because it failed or was throttled recently. */
export interface HeldBackEntry {
  readonly code: string;
  readonly seller: string;
  readonly attemptedOn: string;
  readonly outcome: string;
  readonly daysSinceAttempt: number;
  readonly backoffDays: number;
}

export interface QueueResult {
  /**
   * THE MAIN RESULT. Scanned products with no price on file that no current
   * crawler can reach -- see the header comment for why this is a robots.txt
   * and receipt-feed limit today, not a bug. This is the exact gap between
   * what people want priced and what this system can price, and it is what
   * tells a person which seller or discovery path to add next. Listed first
   * in this object, and meant to be printed first, on purpose.
   */
  readonly scannedNoCrawlerCanReach: readonly UnreachableEntry[];
  /** Codes an existing crawler can act on today, in the order to work them. */
  readonly toCrawl: readonly QueueEntry[];
  /** Codes that would otherwise be in `toCrawl` but are sitting out a backoff. */
  readonly heldBack: readonly HeldBackEntry[];
}

export interface NextToPriceOptions {
  /** Defaults to `PRICES_DB_PATH` (SHIN_PRICES-aware). Never hardcode a path. */
  readonly dbPath?: string;
  /**
   * The seam onto `app/data/scans.db`. Defaults to a function returning an
   * empty map so this file works before that store exists. May return a
   * Promise: the real reader will likely open its own database connection.
   */
  readonly readScanCounts?: () => Map<string, number> | Promise<Map<string, number>>;
  /** Clock injection so tests do not depend on the day they happen to run. */
  readonly now?: () => Date;
  /** Caps `toCrawl` only. `scannedNoCrawlerCanReach` and `heldBack` are never truncated. */
  readonly limit?: number;
}

/** The default scan reader: nothing has been scanned. See the seam comment above. */
export function emptyScanCounts(): Map<string, number> {
  return new Map();
}

/**
 * Days between re-prices for a code scanned `scanCount` times, in whatever
 * window the scan reader counts over (the brief for `app/data/scans.db` says
 * `weeklyCount`, so read this as "times this week" until told otherwise).
 *
 *     intervalDays(scanCount) = max(MIN_INTERVAL_DAYS, round(BASE_INTERVAL_DAYS / (1 + scanCount)))
 *
 * A product nobody has scanned waits the full BASE_INTERVAL_DAYS. Doubling
 * the scan count roughly halves the interval; MIN_INTERVAL_DAYS floors it so
 * one very popular item cannot demand more than one re-price a day.
 *
 * JUDGEMENT CALL, NOT MEASURED. Nobody has data yet on how fast a real price
 * actually moves relative to how often its barcode gets scanned. This shape
 * was picked because it is smooth and has no cliff edges, not because it was
 * fitted to anything -- it is a placeholder to be replaced the day an outcome
 * says a different curve holds, not a number to defend.
 */
const BASE_INTERVAL_DAYS = 30;
const MIN_INTERVAL_DAYS = 1;

export function intervalDaysFor(scanCount: number): number {
  const n = Math.max(0, scanCount);
  return Math.max(MIN_INTERVAL_DAYS, Math.round(BASE_INTERVAL_DAYS / (1 + n)));
}

/**
 * Days a code sits out after N *consecutive* failed or throttled attempts
 * (most recent attempt backwards, across every seller). Doubles per failure,
 * capped at MAX_BACKOFF_DAYS -- the same shape `crawl.ts`'s own per-request
 * gate uses (double on a strike, cap the wait), applied here at day
 * granularity instead of milliseconds, because this queue reorders across
 * days, not requests.
 *
 * JUDGEMENT CALL, NOT MEASURED. Nobody has data yet on how long walmart.ca
 * (or any future seller) holds a grudge past its own request-level throttle;
 * this is a starting guess picked to be safe rather than a fitted curve.
 */
const BASE_BACKOFF_DAYS = 1;
const MAX_BACKOFF_DAYS = 14;

export function backoffDaysFor(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(MAX_BACKOFF_DAYS, BASE_BACKOFF_DAYS * 2 ** (consecutiveFailures - 1));
}

interface AttemptRow {
  readonly code: string;
  readonly seller: string;
  readonly attempted_on: string;
  readonly outcome: string;
}

interface CodeDateRow {
  readonly code: string;
  readonly last_seen: string;
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as unknown as { name: string } | undefined;
  return row !== undefined;
}

/** Latest `seen_on` per joined code. Never NULL codes: an unjoined row cannot be re-priced by code. */
function lastPricedMap(db: DatabaseSync): Map<string, string> {
  const rows = db
    .prepare(`SELECT code, MAX(seen_on) AS last_seen FROM observation WHERE code IS NOT NULL GROUP BY code`)
    .all() as unknown as CodeDateRow[];
  return new Map(rows.map((r) => [r.code, r.last_seen]));
}

/** Every code's attempt history, most recent first, across every seller that tried it. */
function attemptsByCode(db: DatabaseSync): Map<string, AttemptRow[]> {
  const rows = db
    .prepare(`SELECT code, seller, attempted_on, outcome FROM crawl_attempt ORDER BY code, attempted_on DESC`)
    .all() as unknown as AttemptRow[];
  const map = new Map<string, AttemptRow[]>();
  for (const r of rows) {
    const list = map.get(r.code);
    if (list) list.push(r);
    else map.set(r.code, [r]);
  }
  return map;
}

/** Count of failing outcomes from the most recent attempt backwards, stopping at the first success. */
function consecutiveFailures(attempts: readonly AttemptRow[]): number {
  let n = 0;
  for (const a of attempts) {
    if (a.outcome !== 'throttled' && a.outcome !== 'error') break;
    n += 1;
  }
  return n;
}

function daysSince(now: Date, isoDate: string): number {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  return Math.floor((now.getTime() - then) / 86_400_000);
}

const emptyResult: QueueResult = { scannedNoCrawlerCanReach: [], toCrawl: [], heldBack: [] };

export async function nextToPrice(options: NextToPriceOptions = {}): Promise<QueueResult> {
  const path = options.dbPath ?? PRICES_DB_PATH;
  const now = (options.now ?? (() => new Date()))();
  const readScanCounts = options.readScanCounts ?? emptyScanCounts;

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch {
    // No prices database yet, or it is locked by a writer. Never throw: an
    // empty queue is the honest answer to "what should I crawl" when there
    // is nothing to read from, the same way catalogue/src/gaps.ts never lets
    // a failed open reach its caller as an exception.
    return emptyResult;
  }

  try {
    if (!tableExists(db, 'observation')) return emptyResult;

    const scanCounts = await readScanCounts();
    const lastPriced = lastPricedMap(db);
    const attempts = tableExists(db, 'crawl_attempt') ? attemptsByCode(db) : new Map<string, AttemptRow[]>();
    const heldBack: HeldBackEntry[] = [];

    function heldBackFor(code: string): HeldBackEntry | null {
      const list = attempts.get(code);
      if (list === undefined || list.length === 0) return null;
      const fails = consecutiveFailures(list);
      if (fails === 0) return null;
      const latest = list[0];
      const backoffDays = backoffDaysFor(fails);
      const daysSinceAttempt = daysSince(now, latest.attempted_on);
      if (daysSinceAttempt >= backoffDays) return null;
      return { code, seller: latest.seller, attemptedOn: latest.attempted_on, outcome: latest.outcome, daysSinceAttempt, backoffDays };
    }

    // Rule 1: scanned, no price at all. Reported, never queued (see header).
    const scannedNoCrawlerCanReach: UnreachableEntry[] = [];
    for (const [code, scanCount] of scanCounts) {
      if (scanCount <= 0) continue;
      if (lastPriced.has(code)) continue;
      scannedNoCrawlerCanReach.push({
        code,
        scanCount,
        /*
         * CHANGED 2026-09-08, and the change is the word "on demand". Sitemap
         * discovery (`crawl.ts --discover`) can reach this code; it just cannot
         * be asked for it by barcode, because a sitemap is a list to be walked
         * and not an index to be queried. See this file's header.
         */
        reason:
          'scanned but priced nowhere, and no crawler can reach it on demand: ' +
          'walmart.ca discovery has to walk its product sitemap until this barcode turns up, ' +
          'and the openprices rows are a receipt feed, not a queryable crawl target',
      });
    }
    scannedNoCrawlerCanReach.sort((a, b) => b.scanCount - a.scanCount || a.code.localeCompare(b.code));

    // Rule 2: scanned, has a price, due for re-price at this popularity's interval.
    const due: QueueEntry[] = [];
    for (const [code, scanCount] of scanCounts) {
      if (scanCount <= 0) continue;
      const lastSeen = lastPriced.get(code);
      if (lastSeen === undefined) continue; // covered by rule 1 above
      const held = heldBackFor(code);
      if (held) {
        heldBack.push(held);
        continue;
      }
      const priceAgeDays = daysSince(now, lastSeen);
      const intervalDays = intervalDaysFor(scanCount);
      if (priceAgeDays < intervalDays) continue; // not due yet at this popularity
      due.push({
        code,
        reason: 'scanned_due_for_reprice',
        scanCount,
        priceAgeDays,
        intervalDays,
        note: `scanned ${scanCount} times; last priced ${priceAgeDays} days ago, due every ${intervalDays} days at this popularity`,
      });
    }
    due.sort((a, b) => b.scanCount - a.scanCount || b.priceAgeDays - a.priceAgeDays || a.code.localeCompare(b.code));

    // Rule 3: has a price, was not scanned (or scanned 0 times), staleness against the unscanned baseline.
    const stale: QueueEntry[] = [];
    const baselineInterval = intervalDaysFor(0);
    for (const [code, lastSeen] of lastPriced) {
      const scanCount = scanCounts.get(code) ?? 0;
      if (scanCount > 0) continue; // covered by rule 1 or rule 2 above
      const held = heldBackFor(code);
      if (held) {
        heldBack.push(held);
        continue;
      }
      const priceAgeDays = daysSince(now, lastSeen);
      if (priceAgeDays < baselineInterval) continue; // not stale yet
      stale.push({
        code,
        reason: 'stale_unscanned',
        scanCount: 0,
        priceAgeDays,
        intervalDays: baselineInterval,
        note: `not scanned recently; last priced ${priceAgeDays} days ago, stale past the ${baselineInterval} day unscanned baseline`,
      });
    }
    stale.sort((a, b) => b.priceAgeDays - a.priceAgeDays || a.code.localeCompare(b.code));

    let toCrawl = [...due, ...stale];
    if (options.limit !== undefined) toCrawl = toCrawl.slice(0, options.limit);

    return { scannedNoCrawlerCanReach, toCrawl, heldBack };
  } finally {
    db.close();
  }
}
