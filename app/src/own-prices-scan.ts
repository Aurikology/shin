/**
 * R15: the one query in a typed-name search that grows with the table, kept in its own file so the
 * server thread and a worker thread run the very same SQL.
 *
 * "Which listings in the prices file mention this word" is a scan: a LIKE on a computed string cannot
 * use an index, so it reads every observation row. On a generated table of 1,000,000 rows that held the
 * server's one thread for 1.2 to 2.1 seconds, and every other shopper's request waited behind it
 * (scripts/load/bench-typed-search.mjs). `own-prices-worker.ts` runs it on another thread instead.
 */
import type { DatabaseSync } from 'node:sqlite';

/** An extra condition that keeps printed-flyer rows (capture_tile_id set) out of a name match. */
export function notPrintout(db: DatabaseSync): string {
  const cols = db.prepare('PRAGMA table_info(observation)').all() as { name: string }[];
  return cols.some((c) => c.name === 'capture_tile_id') ? ' AND capture_tile_id IS NULL' : '';
}

export interface PriceNameRow {
  readonly code: string | null;
  readonly seller: string;
  readonly seller_sku: string;
  readonly seller_name: string;
  readonly seller_brand: string | null;
}

/** Every distinct named listing whose name and brand contain `like` (a `%word%` pattern), or all of them when `like` is null. */
export function scanPriceNames(db: DatabaseSync, like: string | null): PriceNameRow[] {
  return db
    .prepare(
      `SELECT DISTINCT code, seller, seller_sku, seller_name, seller_brand FROM observation
        WHERE seller_name <> '(unnamed)'${notPrintout(db)}${like ? " AND lower(seller_name || ' ' || coalesce(seller_brand, '')) LIKE ?" : ''}`,
    )
    .all(...(like ? [like] : [])) as unknown as PriceNameRow[];
}
