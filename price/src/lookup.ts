/**
 * The first real implementation of `PriceLookup`.
 *
 * `PriceLookup` (catalogue/src/alternatives.ts) has existed since the alternatives
 * feature was written and until now every caller of it was a test file handing it
 * a hand-built Map. `alternativesFor` has never had a production caller either.
 * That is the whole reason this file exists: without it, the alternatives feature
 * is code nothing imports, and a passing unit test on an uncalled function is not
 * evidence the feature works against a real price database.
 *
 * This is a serving path, not the crawler: it only ever reads, on a read-only
 * connection, and it never touches `in_stock`. That column is recorded as NULL on
 * every openprices row (it means "not observed", not "no"), and nothing here may
 * print or reason about stock at all.
 *
 * A STATED DECISION, NOT AN ACCIDENT: this runs on the caller's own thread, not a
 * worker. `node:sqlite` is synchronous, so `app/server.ts` reserves its request
 * thread for exactly one other synchronous reader today, the catalogue's own
 * `byGtin`, on the strength of it costing 0.2 ms against 5,182,591 rows; a search
 * that can fall through to a full scan was moved to a worker for the same reason
 * in reverse. This query is fine to sit next to `byGtin` on that same thread only
 * because the table it reads is 896 rows today: a single indexed IN-clause read
 * over that is not in the same class as a linear scan of the catalogue. It does
 * NOT stay fine by construction -- the price table grows with every crawl and
 * nothing here will announce the day its scan time stops being negligible. If
 * this ever needs a worker of its own, that is the number to watch, not a guess.
 */

import { DatabaseSync } from 'node:sqlite';
import { PRICES_DB_PATH } from './store.ts';
import type { PriceLookup, PricedProduct } from '../../catalogue/src/alternatives.ts';

/**
 * SQLite's own limit on bound parameters in a single statement is 999
 * (SQLITE_LIMIT_VARIABLE_NUMBER, the compiled-in default). One query per
 * requested code would work but is exactly the query-in-a-loop pattern this
 * function exists to avoid; a single IN clause is capped well under that ceiling,
 * with a chunking loop for the rare caller that asks for more than this at once,
 * rather than either hitting SQLite's own limit or trusting every caller to chunk
 * for us.
 */
const MAX_CODES_PER_QUERY = 500;

interface PriceRow {
  code: string;
  seller: string;
  price_cents: number;
  seen_on: string;
  store_name: string | null;
  store_city: string | null;
  join_method: 'gtin' | 'name' | 'none';
}

/**
 * Opened once and reused, the same way `server.ts` keeps one catalogue handle for
 * the life of the process rather than opening a connection per request. Opened
 * lazily, on the first call, so importing this module never fails just because
 * the price database has not been built yet in whatever process imports it.
 */
let db: DatabaseSync | null = null;

function pricesDb(): DatabaseSync {
  if (!db) {
    // Read only: this path serves verdicts, it does not record them. A
    // read-only connection also cannot run the DDL in store.ts's openPrices,
    // which is correct here -- a serving process has no business creating or
    // migrating the table it is only supposed to be reading from.
    db = new DatabaseSync(PRICES_DB_PATH, { readOnly: true });
  }
  return db;
}

/**
 * The most recent observation for each requested code.
 *
 * "Most recent" is decided by `seen_on` alone, per the table's own rule (store.ts):
 * nothing here is ever averaged into a value, so there is nothing to do but pick
 * the newest row and say where it came from.
 */
export const lookupPrices: PriceLookup = async (codes) => {
  const out = new Map<string, PricedProduct>();
  if (codes.length === 0) return out;

  const conn = pricesDb();

  for (let i = 0; i < codes.length; i += MAX_CODES_PER_QUERY) {
    const chunk = codes.slice(i, i + MAX_CODES_PER_QUERY);
    const placeholders = chunk.map(() => '?').join(',');

    /*
     * Ordered by code, then by seen_on descending, so the first row this loop
     * sees for a given code is that code's most recent observation. A code with
     * a same-day observation from more than one seller is broken by seller name
     * only for a deterministic pick -- there is no pricing reason to prefer one
     * seller over another here, only a need to not pick differently on two runs
     * of the same query.
     */
    const rows = conn
      .prepare(
        /*
         * "AND code IS NOT NULL" is belt and braces, not the mechanism: every
         * 'none' (unjoined) row already has `code` NULL (store.ts's own rule,
         * confirmed against the live table -- all 100 of them), so `WHERE code
         * IN (...)` alone can never bind to one. Nothing here is filtering out
         * an untrustworthy row; there is no row this clause is doing work on.
         * It stays because a query someone edits later should not have to
         * re-derive that fact to keep the guarantee true.
         */
        `SELECT code, seller, price_cents, seen_on, store_name, store_city, join_method
           FROM observation
          WHERE code IN (${placeholders}) AND code IS NOT NULL
          ORDER BY code, seen_on DESC, seller ASC`,
      )
      .all(...chunk) as unknown as PriceRow[];

    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.code)) continue; // a later row for this code is older
      seen.add(row.code);

      if (row.join_method === 'none') {
        // Cannot happen against today's table (see above), but this is a
        // serving path reading data it does not control. If a 'none' row ever
        // does arrive, it is skipped rather than forced into the two-value
        // union `PricedProduct.joinMethod` admits: a row that could not be
        // tied to a product has no honest join method to report, and the
        // other lane is coding against that two-value contract, not a three
        // -value one that quietly turns into 'gtin' or 'name' by coercion.
        continue;
      }

      out.set(row.code, {
        code: row.code,
        amountCents: row.price_cents,
        seller: row.seller,
        observedAt: row.seen_on,
        storeName: row.store_name,
        storeCity: row.store_city,
        joinMethod: row.join_method,
      });
    }
  }

  return out;
};
