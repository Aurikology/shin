/**
 * Best Buy (US) customer ratings for tech, item 27 of the beta build plan.
 *
 * The plan's own steps: "Lookup by barcode; store average, count, URL, fetched
 * date; refresh weekly" and "Shown only for tech categories, labelled 'Best Buy
 * (US)' with the link."
 *
 * NO KEY EXISTS YET, AND NOTHING HERE ASKS FOR ONE. The founder's input list
 * calls the developer key the one input that needs an email address in his name
 * (I7), and says the rating ships the hour a key exists and the beta does not
 * wait on it. So this file is built to be inert without a key and complete with
 * one: every call goes through an injectable fetcher, the default fetcher reads
 * `BESTBUY_API_KEY` out of the environment and answers "no source" when it is
 * absent, and the tests below run entirely on fixtures. Nothing in this file
 * opened the network on the day it was written.
 *
 * WHY A RATING IS NOT A PRICE, and why this lives beside the price store rather
 * than inside it. `spine/src/sources/bestbuy.ts` refuses to let a US dollar
 * number reach a Canadian verdict, because a price is a fact about a country. A
 * rating is not: the people who reviewed a pair of headphones were reviewing the
 * headphones. So the rating crosses the border and the price does not, and that
 * asymmetry is the whole reason these are two different tables in two different
 * files rather than one adapter with a flag.
 *
 * WHAT IS STORED WHEN THERE IS NOTHING TO STORE. Three outcomes, kept apart,
 * because collapsing them is how a zero starts meaning three things: `rated` is
 * a real average from real reviewers, `unrated` is a product Best Buy sells that
 * nobody has reviewed, and `not_found` is a barcode Best Buy does not carry.
 * Reading the second or third as "average 0" would put a one-star-looking
 * product on a screen because nobody has bought it yet.
 *
 * THE NUMBER IS NEVER RECOMPUTED, ROUNDED OR COMBINED. It is Best Buy's own
 * average, out of five, stored as published, shown with their name and a link to
 * the page it came from. Item 30's rule for the whole review display: "shown
 * only when a licensed source has a row; nothing generated."
 */

import { DatabaseSync } from 'node:sqlite';

/** The only source this file writes. A second one gets its own id, never this row. */
export const BESTBUY_US = 'bestbuy-us';

/** The sentence any screen showing one of these rows must show with it. Item 27c. */
export const BESTBUY_US_LABEL = 'Best Buy (US)';

/**
 * How old a stored rating may be before it is fetched again. Item 27b says
 * weekly, so weekly is where this number comes from; it is the plan's, not a
 * measurement of how fast ratings move.
 */
export const REFRESH_AFTER_DAYS = 7;

/**
 * The wait between two calls in a bulk pass.
 *
 * A DESIGN DEFAULT, NOT A MEASUREMENT, and it is the first thing to check when a
 * key lands: nobody here has read Best Buy's developer terms or measured what
 * their API does under load, and `price/src/crawl.ts` exists because guessing
 * that for Walmart cost a lockout. One request a second is slow enough to be
 * defensible and the bulk pass takes a flag so it can be slowed further without
 * a code change.
 */
export const BULK_DELAY_MS = 1000;

export type RatingOutcome =
  /** Best Buy carries it and somebody has reviewed it. */
  | 'rated'
  /** Best Buy carries it and nobody has reviewed it. A fact, not a zero. */
  | 'unrated'
  /** Best Buy does not carry this barcode at all. Also a fact, and worth not re-asking daily. */
  | 'not_found';

export interface RatingRow {
  /** The catalogue's barcode, as the catalogue stores it. */
  readonly code: string;
  readonly source: string;
  /** Out of five, exactly as published. Null for `unrated` and `not_found`. */
  readonly average: number | null;
  /** How many people reviewed it. Zero is a real answer. */
  readonly count: number;
  /** The product page the number came from, so a screen can link to it. */
  readonly url: string | null;
  readonly outcome: RatingOutcome;
  /** ISO date the number was read. What staleness is measured against. */
  readonly fetchedOn: string;
}

/** What a fetcher hands back for one barcode. Null means the source could not be reached at all. */
export interface FetchedRating {
  readonly average: number | null;
  readonly count: number;
  readonly url: string | null;
  readonly outcome: RatingOutcome;
}

/**
 * The seam. Everything in this file takes one of these; the default one below
 * reads the environment, and the tests pass a function over a fixture.
 *
 * Returning null is "I could not ask", which is different from every outcome
 * above: a missing key, a network that is down, a 500. Nothing is stored for it,
 * because storing "not found" for a question nobody managed to ask is how an
 * outage becomes a permanent fact about a product.
 */
export interface RatingFetcher {
  (gtin: string): Promise<FetchedRating | null>;
}

const DDL = `
CREATE TABLE IF NOT EXISTS product_rating (
  code         TEXT NOT NULL,
  source       TEXT NOT NULL,
  average      REAL,
  rating_count INTEGER NOT NULL,
  url          TEXT,
  outcome      TEXT NOT NULL,
  fetched_on   TEXT NOT NULL,
  PRIMARY KEY (code, source)
) STRICT;

CREATE INDEX IF NOT EXISTS rating_by_age ON product_rating(source, fetched_on);
`;

/**
 * Creates the table if it is not there. Called by every entry point in this file
 * rather than once at startup, for the reason `store.ts` gives about its own
 * DDL: a package that opens this database somewhere else must not have to
 * remember a setup step, and CREATE TABLE IF NOT EXISTS costs nothing.
 */
export function ensureRatings(db: DatabaseSync): void {
  db.exec(DDL);
}

interface Raw {
  code: string;
  source: string;
  average: number | null;
  rating_count: number;
  url: string | null;
  outcome: string;
  fetched_on: string;
}

function rowOf(r: Raw): RatingRow {
  return {
    code: r.code,
    source: r.source,
    average: r.average,
    count: r.rating_count,
    url: r.url,
    outcome: r.outcome as RatingOutcome,
    fetchedOn: r.fetched_on,
  };
}

/** What we hold for one product, or null if we have never asked. */
export function storedRating(db: DatabaseSync, code: string, source = BESTBUY_US): RatingRow | null {
  ensureRatings(db);
  const r = db
    .prepare('SELECT * FROM product_rating WHERE code = ? AND source = ?')
    .get(code, source) as unknown as Raw | undefined;
  return r === undefined ? null : rowOf(r);
}

/** Writes one row, replacing whatever was there. A rating is a snapshot, never a history. */
export function putRating(db: DatabaseSync, row: RatingRow): void {
  ensureRatings(db);
  db.prepare(
    `INSERT OR REPLACE INTO product_rating (code, source, average, rating_count, url, outcome, fetched_on)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(row.code, row.source, row.average, row.count, row.url, row.outcome, row.fetchedOn);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((b - a) / 86_400_000);
}

/** Whether this row is old enough to ask again. Item 27b's weekly refresh, in one place. */
export function isStale(row: RatingRow, today: string): boolean {
  return daysBetween(row.fetchedOn, today) >= REFRESH_AFTER_DAYS;
}

export type RefreshStatus =
  /** What we held was fresh enough; nobody was asked anything. */
  | 'kept'
  /** We asked and wrote a new row. */
  | 'refreshed'
  /** The fetcher could not ask. Anything we already held is kept untouched. */
  | 'unreachable';

export interface RefreshResult {
  readonly status: RefreshStatus;
  /** What the caller should show. Null only when we have never successfully asked. */
  readonly row: RatingRow | null;
}

/**
 * The one call a screen needs: give me this product's rating, fetching it if we
 * have never asked or if what we hold is a week old.
 *
 * IT ANSWERS WITH WHAT IT HAS WHEN IT CANNOT ASK. A stale row is shown rather
 * than withheld, because its `fetchedOn` is on the row and a rating from last
 * month is still what people thought of the thing. CLAUDE.md priority 1: the
 * worst thing this app can do is tell somebody it does not know.
 */
export async function ratingFor(
  db: DatabaseSync,
  code: string,
  fetch: RatingFetcher,
  today: string,
  source = BESTBUY_US,
): Promise<RefreshResult> {
  const held = storedRating(db, code, source);
  if (held !== null && !isStale(held, today)) return { status: 'kept', row: held };

  const got = await fetch(code);
  if (got === null) return { status: 'unreachable', row: held };

  const row: RatingRow = {
    code,
    source,
    average: got.average,
    count: got.count,
    url: got.url,
    outcome: got.outcome,
    fetchedOn: today.slice(0, 10),
  };
  putRating(db, row);
  return { status: 'refreshed', row };
}

/** Rows we hold that are due another look, oldest first. The weekly pass's work list. */
export function dueForRefresh(
  db: DatabaseSync,
  today: string,
  limit: number | null = null,
  source = BESTBUY_US,
): RatingRow[] {
  ensureRatings(db);
  const cutoff = new Date(Date.parse(`${today.slice(0, 10)}T00:00:00Z`) - REFRESH_AFTER_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const rows = db
    .prepare(
      `SELECT * FROM product_rating
        WHERE source = ? AND fetched_on <= ?
        ORDER BY fetched_on
        ${limit === null ? '' : 'LIMIT ?'}`,
    )
    .all(...(limit === null ? [source, cutoff] : [source, cutoff, limit])) as unknown as Raw[];
  return rows.map(rowOf);
}

export interface BulkTally {
  readonly considered: number;
  readonly refreshed: number;
  readonly unreachable: number;
}

/**
 * The weekly pass. Walks the rows that are a week old and asks again.
 *
 * It refreshes only what is already stored. A barcode nobody has ever scanned
 * has no row, and inventing a crawl over the catalogue's half million tech codes
 * to fill that in would be a different item with a different rate question; the
 * lazy path above is what puts a row there in the first place, so this pass
 * follows real use instead of guessing at it.
 */
export async function refreshDue(
  db: DatabaseSync,
  fetch: RatingFetcher,
  today: string,
  options: { limit?: number | null; delayMs?: number; onRow?: (line: string) => void } = {},
): Promise<BulkTally> {
  const rows = dueForRefresh(db, today, options.limit ?? null);
  const delayMs = options.delayMs ?? BULK_DELAY_MS;
  let refreshed = 0;
  let unreachable = 0;

  for (const [i, row] of rows.entries()) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const r = await ratingFor(db, row.code, fetch, today, row.source);
    if (r.status === 'refreshed') refreshed += 1;
    else if (r.status === 'unreachable') unreachable += 1;
    options.onRow?.(`  ${row.code}  ${r.status}  ${r.row?.outcome ?? 'nothing held'}`);
  }

  return { considered: rows.length, refreshed, unreachable };
}

/*
 * ---------------------------------------------------------------------------
 * The default fetcher: the only part of this file that would ever open a socket,
 * and it opens none without a key.
 * ---------------------------------------------------------------------------
 */

const DEFAULT_BASE = 'https://api.bestbuy.com/v1';

interface ApiProduct {
  customerReviewAverage?: number | string;
  customerReviewCount?: number;
  url?: string;
}

function asNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Reads one barcode's rating out of Best Buy's US product API.
 *
 * WRITTEN, NEVER RUN, exactly as `spine/src/sources/bestbuy.ts` says of itself:
 * there is no key on this machine, so no call has been made and the field names
 * below are taken from that adapter's existing shape plus the two review fields.
 * The hour a key lands, this is the function to run once by hand against a known
 * barcode before anything schedules it, and the result belongs in the scoreboard
 * rather than in a comment here.
 */
export function bestBuyFetcher(env: Record<string, string | undefined> = process.env): RatingFetcher {
  const key = env.BESTBUY_API_KEY;
  const base = env.BESTBUY_API_BASE ?? DEFAULT_BASE;

  return async (gtin: string): Promise<FetchedRating | null> => {
    if (!key) return null; // No key is "could not ask", never "not found".
    const url = `${base}/products(upc=${encodeURIComponent(gtin)})?format=json&show=customerReviewAverage,customerReviewCount,url&apiKey=${key}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: 'application/json' } });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    let body: { products?: ApiProduct[] };
    try {
      body = (await res.json()) as { products?: ApiProduct[] };
    } catch {
      return null;
    }

    const hit = (body.products ?? [])[0];
    if (hit === undefined) {
      return { average: null, count: 0, url: null, outcome: 'not_found' };
    }
    const average = asNumber(hit.customerReviewAverage);
    const count = asNumber(hit.customerReviewCount) ?? 0;
    if (average === null || count <= 0) {
      return { average: null, count: 0, url: hit.url ?? null, outcome: 'unrated' };
    }
    return { average, count, url: hit.url ?? null, outcome: 'rated' };
  };
}

/** Whether a key is present, so a caller can say "not yet" instead of trying. */
export function ratingsAvailable(env: Record<string, string | undefined> = process.env): {
  ok: boolean;
  reason?: string;
} {
  return env.BESTBUY_API_KEY
    ? { ok: true }
    : { ok: false, reason: 'BESTBUY_API_KEY is not set, so no rating has been fetched' };
}

/**
 * The weekly job, for whatever runs it: `node src/bestbuy-ratings.ts --refresh`.
 *
 * It exits without asking anything when there is no key, so it is safe to
 * schedule before one exists. `--limit` caps a run and `--delay-ms` slows it;
 * both exist because the rate this API tolerates has not been measured.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const value = (name: string, dflt: number) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
  };

  const can = ratingsAvailable();
  if (!can.ok) {
    console.log(`bestbuy ratings: ${can.reason}. Nothing was asked and nothing was written.`);
    return;
  }

  const { openPrices, PRICES_DB_PATH } = await import('./store.ts');
  const db = openPrices(PRICES_DB_PATH);
  const today = new Date().toISOString().slice(0, 10);
  const limitArg = value('--limit', -1);

  const t = await refreshDue(db, bestBuyFetcher(), today, {
    limit: limitArg < 0 ? null : limitArg,
    delayMs: value('--delay-ms', BULK_DELAY_MS),
    onRow: (line) => console.log(line),
  });

  console.log('');
  console.log(`  due          ${t.considered}`);
  console.log(`  refreshed    ${t.refreshed}`);
  console.log(`  unreachable  ${t.unreachable}`);
  console.log('');
  db.close();
}

if (import.meta.filename === process.argv[1]) {
  void main();
}
