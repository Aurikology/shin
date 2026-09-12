/**
 * Where price observations live.
 *
 * One row per (seller, seller's own id, date seen). Nothing is ever overwritten
 * and nothing is ever averaged into a stored number. A range is a question you
 * ask of this table, not a value you save, because the moment you save a range
 * you have thrown away the evidence that would let you notice it was wrong.
 *
 * The table is separate from the catalogue database on purpose. The catalogue
 * is built once from a bulk download and rebuilt wholesale; observations
 * accumulate forever and must survive a catalogue rebuild.
 *
 * Two kinds of row live here:
 *
 *   joined   - `code` is set, and the observation is attached to a catalogue
 *              product. Only these can produce a verdict.
 *   unjoined - `code` is NULL. The seller published a price we could not tie to
 *              anything. Kept, never discarded, because a barcode may appear on
 *              a later crawl and resolve it retroactively. Throwing these away
 *              is throwing away the only record that the seller stocks a thing
 *              our catalogue has never heard of.
 *
 * WHAT AN UNJOINED ROW HAS TO CARRY, added 2026-09-08. The sentence above says
 * a barcode may appear on a later crawl and resolve the row retroactively, and
 * until today that was not true of anything this table stored: the crawl read a
 * barcode off the product page, failed to find it in a catalogue that is not on
 * every machine, and then wrote the row without the barcode. The only way to
 * resolve such a row later was to open the seller's page again. `page_gtin`
 * below is the barcode exactly as the seller published it, kept on the row so
 * the join can be retried against a catalogue that arrives afterwards, with no
 * second request to the seller. It is the seller's claim, never ours: it is not
 * normalised, not padded and not checked here, because a stored number that has
 * been quietly rewritten cannot be argued with later. `code` stays the only
 * field that means "this is a catalogue product", and `page_gtin` never stands
 * in for it. See `rejoin.ts` for the leg that turns one into the other.
 */

import { DatabaseSync } from 'node:sqlite';

/** How the row was tied to a catalogue product, stored so a number can be argued with later. */
export type JoinMethod = 'gtin' | 'name' | 'none';

/** Whether the number is what the thing normally costs or what it costs today. */
export type PriceKind = 'regular' | 'promotional';

export interface ObservationRow {
  /** Catalogue product code, zero padded to 13. NULL when the row could not be joined. */
  readonly code: string | null;
  readonly seller: string;
  /** The seller's own product id. The stable key for re-crawls. */
  readonly sellerSku: string;
  readonly sellerName: string;
  readonly sellerBrand: string | null;
  readonly priceCents: number;
  readonly kind: PriceKind;
  /** Unit price in cents per base unit, when the seller publishes one already computed. */
  readonly unitPriceCents: number | null;
  readonly unitLabel: string | null;
  readonly currency: string;
  readonly country: string;
  /** Region or store, when the seller prices by location. NULL means national. */
  readonly region: string | null;
  readonly joinMethod: JoinMethod;
  /**
   * The barcode the seller's own page published, verbatim, or null when the
   * page published none. Optional for the same reason the three store_*
   * fields below are: a caller written before this existed, or one whose
   * source carries no barcode at all (Open Prices supplies the code itself,
   * Loblaws publishes none), is not forced to invent a value. Omitted means
   * the caller does not carry a page barcode; present and null means it does
   * and this page had none. NEVER a substitute for `code`: a row with a
   * `page_gtin` and a NULL `code` is unjoined and stays invisible to every
   * serving path until `rejoin.ts` finds the barcode in a catalogue.
   */
  readonly pageGtin?: string | null;
  /** ISO date, no time. One observation per seller per product per day is enough. */
  readonly seenOn: string;
  readonly url: string | null;
  readonly imageUrl: string | null;
  /**
   * Whether the item was in stock when observed: 1 yes, 0 no. NULL means no
   * stock claim was made at all, and that is not the same thing as 0. A
   * source that photographs a price tag, not a shelf (see openprices.ts's
   * header), carries no stock signal whatsoever, and writing 0 or 1 in that
   * case would assert an observation nobody made. NULL is the honest value
   * for "we do not know", and a caller that never observed stock must pass
   * it rather than guess.
   */
  readonly inStock: number | null;
  /**
   * The three fields below are optional so a caller that never learned a
   * physical store's identity (an online listing, or a caller written
   * before these fields existed) is not forced to invent a value. Omitted
   * means the caller does not carry store identity at all; present and null
   * means it does, but this particular row has none.
   */
  /** Human readable store name, e.g. "Dominion". NULL when not a shop (see openprices.ts's filter) or unknown. */
  readonly storeName?: string | null;
  /** The store's city, e.g. "Mount Pearl". Same NULL rule as storeName. */
  readonly storeCity?: string | null;
  /**
   * The composite OpenStreetMap id, "<OSM_TYPE>/<id>", e.g. "WAY/120689533".
   * NEVER the bare numeric id: node, way and relation ids are separate number
   * spaces in OpenStreetMap, so the same integer can name three different
   * places depending on which space it came from, and a bare id silently
   * picks one of the three without saying so.
   */
  readonly storeOsm?: string | null;
}

const DDL = `
CREATE TABLE IF NOT EXISTS observation (
  code            TEXT,
  seller          TEXT NOT NULL,
  seller_sku      TEXT NOT NULL,
  seller_name     TEXT NOT NULL,
  seller_brand    TEXT,
  price_cents     INTEGER NOT NULL,
  kind            TEXT NOT NULL,
  unit_price_cents INTEGER,
  unit_label      TEXT,
  currency        TEXT NOT NULL,
  country         TEXT NOT NULL,
  region          TEXT,
  join_method     TEXT NOT NULL,
  seen_on         TEXT NOT NULL,
  url             TEXT,
  image_url       TEXT,
  /*
   * No NOT NULL and no DEFAULT. A default of 1 here is the bug this column
   * used to have: it made silence say yes. Open Prices' API carries no stock
   * field at all, so every row it ever wrote asserted a fact nobody observed.
   * NULL is now a real, storable state, meaning "not observed", distinct
   * from 0, "observed out of stock".
   */
  in_stock        INTEGER,
  store_name      TEXT,
  store_city      TEXT,
  store_osm       TEXT,
  /*
   * The seller's own barcode for this listing, as printed on their page. Added
   * 2026-09-08 so an unjoined row can be joined later without re-opening the
   * seller's page. NULL means the page published none, or the source has no
   * such thing at all.
   */
  page_gtin       TEXT,
  PRIMARY KEY (seller, seller_sku, seen_on)
);

CREATE INDEX IF NOT EXISTS observation_by_code ON observation(code, seen_on);
CREATE INDEX IF NOT EXISTS observation_unjoined ON observation(join_method) WHERE code IS NULL;

/*
 * One row per catalogue product per seller per crawl attempt, whether or not it
 * found anything. Without this a zero is indistinguishable from never having
 * looked, and the coverage number that decides what this product can be would
 * be measured against the wrong denominator.
 */
CREATE TABLE IF NOT EXISTS crawl_attempt (
  code        TEXT NOT NULL,
  seller      TEXT NOT NULL,
  attempted_on TEXT NOT NULL,
  outcome     TEXT NOT NULL,
  candidates  INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  PRIMARY KEY (code, seller, attempted_on)
);

CREATE INDEX IF NOT EXISTS attempt_by_outcome ON crawl_attempt(seller, outcome);
`;

/**
 * What a single attempt to price one catalogue product at one seller produced.
 *
 * `matched` and `named` are kept apart because they answer different questions.
 * `matched` means the seller published a barcode and it was ours: the number is
 * trustworthy. `named` means the seller sells something with the same brand and
 * name and size but published no barcode to prove it: the number is probably
 * right and is stored as a weaker join so a later pass can decide what to do
 * with it. Collapsing the two would hide exactly the error that matters.
 */
export type AttemptOutcome =
  | 'matched'
  | 'named'
  | 'no_candidates'
  | 'no_barcode_match'
  /**
   * The seller had candidates and none of them was confidently this product.
   * Added 2026-09-11 for item 17, the Canadian Tire run.
   *
   * It is not `no_barcode_match` and the difference is the whole reason it
   * exists. Canadian Tire publishes no barcode at all (measured 2026-09-05,
   * `canadiantire.ts`'s header: `partNumber` is a vendor part number and the one
   * 12 digit example fails its own check digit), so every row from that seller
   * joins by brand, name and size or does not join. Recording those misses as a
   * barcode mismatch would report a fact about a field the seller does not
   * publish, and the coverage figure for a name-joining seller would be read as
   * though it had failed a check nobody ran.
   */
  | 'no_name_match'
  /**
   * The seller refused to answer. NOT a zero. A throttled row is retried and
   * must never sit in the denominator of a coverage figure, because doing so
   * reports our own request rate as a fact about what the seller stocks.
   */
  | 'throttled'
  | 'error';

/**
 * Default location of the price database. SHIN_PRICES overrides it, the same
 * way catalogue/src/load.ts's SHIN_CATALOGUE overrides that package's own
 * path, so a package outside price/ (the app that serves a verdict has to
 * open this same database) is not stuck hardcoding a relative path of its
 * own into a different package's data directory. The fallback is exactly
 * the path openprices.ts and crawl.ts already resolved on their own before
 * this existed, so nothing that runs today without the variable set changes
 * behaviour.
 */
export const PRICES_DB_PATH: string =
  process.env.SHIN_PRICES ??
  new URL('../data/prices.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * Columns added to `observation` after the table already existed somewhere.
 *
 * WHY THIS IS AN ALTER AND NOT A `migrate-observation.ts` STYLE REBUILD, and
 * the two are not interchangeable. That script exists because SQLite cannot
 * DROP a NOT NULL constraint in place, so removing `in_stock`'s default meant
 * copying every row into a new table under a transaction with a row count
 * check on the other side, and that is a destructive operation a person runs
 * deliberately, not something a library function does to a database it was
 * merely asked to open. Adding a nullable column is the other case: SQLite
 * supports `ALTER TABLE ... ADD COLUMN` in place, no row is rewritten and no
 * value can be lost, so there is nothing for a person to supervise.
 *
 * The DDL above uses CREATE TABLE IF NOT EXISTS, which means a database that
 * already has `observation` never sees a column added to that statement. So
 * without this, `page_gtin` would exist only in databases created after today
 * and `recordObservation` would fail with "no such column" on every database
 * created before it, including the live `price/data/prices.db`. Idempotent:
 * it reads the table's real shape and adds only what is missing, so opening
 * the database twice, or a hundred times, does the same thing as opening it
 * once.
 */
function addMissingColumns(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(observation)').all() as unknown as { name: string }[];
  const have = new Set(columns.map((c) => c.name));
  if (!have.has('page_gtin')) db.exec('ALTER TABLE observation ADD COLUMN page_gtin TEXT');
}

/*
 * Created after addMissingColumns rather than inside DDL above: on a database
 * that predates `page_gtin`, an index over that column in the same statement
 * batch that creates the table would fail before the ALTER had a chance to run.
 * This is the index `rejoin.ts` walks, and it is partial on purpose - it covers
 * only the rows that leg can do anything with, which is a few hundred out of a
 * table that grows with every crawl.
 */
const REJOIN_INDEX = `
CREATE INDEX IF NOT EXISTS observation_rejoinable
  ON observation(page_gtin)
  WHERE code IS NULL AND page_gtin IS NOT NULL;
`;

export function openPrices(path: string = PRICES_DB_PATH): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(DDL);
  addMissingColumns(db);
  db.exec(REJOIN_INDEX);
  return db;
}

/*
 * INSERT OR REPLACE deletes the existing row and inserts a fresh one; it does
 * not merge. Any column that exists in the table but is missing from this
 * statement's column list silently reverts to its default (or NULL, now that
 * in_stock has none) on every re-crawl of an already-seen key. The three
 * store_* columns were added to the table in this same change; if a future
 * column is added to the table and not added here, in both the column list
 * and the values list and the bind arguments below, it will quietly wipe
 * itself out on the next INSERT OR REPLACE for that key. Count them: 21
 * columns, 21 placeholders, 21 bind arguments below. Keep the three counts
 * equal. (`page_gtin` was the 21st, added 2026-09-08.)
 */
export function recordObservation(db: DatabaseSync, o: ObservationRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO observation
       (code, seller, seller_sku, seller_name, seller_brand, price_cents, kind,
        unit_price_cents, unit_label, currency, country, region, join_method,
        seen_on, url, image_url, in_stock, store_name, store_city, store_osm,
        page_gtin)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    o.code,
    o.seller,
    o.sellerSku,
    o.sellerName,
    o.sellerBrand,
    o.priceCents,
    o.kind,
    o.unitPriceCents,
    o.unitLabel,
    o.currency,
    o.country,
    o.region,
    o.joinMethod,
    o.seenOn,
    o.url,
    o.imageUrl,
    o.inStock,
    o.storeName ?? null,
    o.storeCity ?? null,
    o.storeOsm ?? null,
    o.pageGtin ?? null,
  );
}

export function recordAttempt(
  db: DatabaseSync,
  code: string,
  seller: string,
  on: string,
  outcome: AttemptOutcome,
  candidates: number,
  note: string | null,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO crawl_attempt (code, seller, attempted_on, outcome, candidates, note)
     VALUES (?,?,?,?,?,?)`,
  ).run(code, seller, on, outcome, candidates, note);
}

/**
 * Codes this seller has already given a real answer about, so a resumed crawl
 * does not repeat work. Throttles and errors are deliberately NOT here: they
 * are the rows a resume exists to go back for.
 */
export function alreadyAttempted(db: DatabaseSync, seller: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT DISTINCT code FROM crawl_attempt
        WHERE seller = ? AND outcome NOT IN ('throttled','error')`,
    )
    .all(seller) as unknown as { code: string }[];
  return new Set(rows.map((r) => r.code));
}

export interface Coverage {
  /** Rows that produced a real answer. Throttles and errors are excluded on purpose. */
  readonly attempted: number;
  readonly matched: number;
  readonly named: number;
  readonly noCandidates: number;
  readonly noBarcodeMatch: number;
  /** Candidates existed and none was confidently this product. Name-joining sellers only. */
  readonly noNameMatch: number;
  readonly throttled: number;
  readonly errors: number;
}

/**
 * The number the whole business rests on: of the catalogue rows we asked about,
 * how many came back with a price we can stand behind.
 */
export function coverage(db: DatabaseSync, seller: string): Coverage {
  const rows = db
    .prepare('SELECT outcome, COUNT(*) n FROM crawl_attempt WHERE seller = ? GROUP BY outcome')
    .all(seller) as unknown as { outcome: string; n: number }[];
  const by = new Map(rows.map((r) => [r.outcome, r.n]));
  const get = (k: string) => by.get(k) ?? 0;
  const answered =
    get('matched') + get('named') + get('no_candidates') + get('no_barcode_match') + get('no_name_match');
  return {
    attempted: answered,
    matched: get('matched'),
    named: get('named'),
    noCandidates: get('no_candidates'),
    noBarcodeMatch: get('no_barcode_match'),
    noNameMatch: get('no_name_match'),
    throttled: get('throttled'),
    errors: get('error'),
  };
}

/*
 * ---------------------------------------------------------------------------
 * REJOIN, 2026-09-08. The two reads and the one write `rejoin.ts` needs.
 *
 * They live here, next to the rest of this table's SQL, because every other
 * statement against `observation` is in this file and a second file writing its
 * own UPDATE against these columns is how the column list in `recordObservation`
 * got its warning comment in the first place.
 * ---------------------------------------------------------------------------
 */

/** One stored row that has a barcode and no catalogue code: a join waiting on a catalogue. */
export interface RejoinableRow {
  readonly seller: string;
  readonly sellerSku: string;
  readonly seenOn: string;
  /** Never null: the query below selects only rows that have one. */
  readonly pageGtin: string;
  readonly sellerName: string;
  readonly sellerBrand: string | null;
  readonly priceCents: number;
  readonly kind: PriceKind;
  readonly url: string | null;
}

/**
 * Rows a catalogue could still resolve.
 *
 * Only `code IS NULL AND page_gtin IS NOT NULL`. A row that was kept unjoined
 * because the seller published no barcode at all is not here: nothing a
 * catalogue arriving later can do would join it, and returning it would make a
 * rejoin run report work it cannot do.
 */
export function rejoinable(
  db: DatabaseSync,
  seller: string | null = null,
  limit: number | null = null,
): RejoinableRow[] {
  const rows = db
    .prepare(
      `SELECT seller, seller_sku, seen_on, page_gtin, seller_name, seller_brand,
              price_cents, kind, url
         FROM observation
        WHERE code IS NULL
          AND page_gtin IS NOT NULL
          ${seller === null ? '' : 'AND seller = ?'}
        ORDER BY seen_on, seller, seller_sku
        ${limit === null ? '' : 'LIMIT ?'}`,
    )
    .all(...(seller === null ? [] : [seller]), ...(limit === null ? [] : [limit])) as unknown as {
    seller: string;
    seller_sku: string;
    seen_on: string;
    page_gtin: string;
    seller_name: string;
    seller_brand: string | null;
    price_cents: number;
    kind: PriceKind;
    url: string | null;
  }[];
  return rows.map((r) => ({
    seller: r.seller,
    sellerSku: r.seller_sku,
    seenOn: r.seen_on,
    pageGtin: r.page_gtin,
    sellerName: r.seller_name,
    sellerBrand: r.seller_brand,
    priceCents: r.price_cents,
    kind: r.kind,
    url: r.url,
  }));
}

/**
 * One stored row from a seller that publishes no barcode, waiting on a name.
 *
 * ADDED 2026-09-11 for item 17. `rejoinable` above is the barcode leg and
 * deliberately refuses to return these rows: nothing a catalogue arriving later
 * can do would join a row by a barcode the seller never published. But a row
 * from Canadian Tire, which publishes none at all, is not unjoinable forever;
 * it is joinable by brand and name against a catalogue, which is the same offline
 * question asked of different columns. So it gets its own reader, and the two
 * legs stay apart so a run can report them apart: "waiting on a barcode we hold"
 * and "waiting on a name match" are different work.
 */
export interface NameRejoinableRow {
  readonly seller: string;
  readonly sellerSku: string;
  readonly seenOn: string;
  readonly sellerName: string;
  readonly sellerBrand: string | null;
  readonly priceCents: number;
  readonly kind: PriceKind;
  readonly url: string | null;
}

/** Unjoined rows with no barcode on them, for the name leg of a nightly rejoin. */
export function nameRejoinable(
  db: DatabaseSync,
  seller: string | null = null,
  limit: number | null = null,
): NameRejoinableRow[] {
  const rows = db
    .prepare(
      `SELECT seller, seller_sku, seen_on, seller_name, seller_brand, price_cents, kind, url
         FROM observation
        WHERE code IS NULL
          AND page_gtin IS NULL
          ${seller === null ? '' : 'AND seller = ?'}
        ORDER BY seen_on, seller, seller_sku
        ${limit === null ? '' : 'LIMIT ?'}`,
    )
    .all(...(seller === null ? [] : [seller]), ...(limit === null ? [] : [limit])) as unknown as {
    seller: string;
    seller_sku: string;
    seen_on: string;
    seller_name: string;
    seller_brand: string | null;
    price_cents: number;
    kind: PriceKind;
    url: string | null;
  }[];
  return rows.map((r) => ({
    seller: r.seller,
    sellerSku: r.seller_sku,
    seenOn: r.seen_on,
    sellerName: r.seller_name,
    sellerBrand: r.seller_brand,
    priceCents: r.price_cents,
    kind: r.kind,
    url: r.url,
  }));
}

/**
 * Attach a catalogue code to one already-stored row, in place.
 *
 * `AND code IS NULL` in the WHERE clause is the idempotency, and it is in the
 * statement rather than in the caller on purpose: it makes a second rejoin run
 * a no-op at the level of the database, not at the level of whoever remembered
 * to check first. It also means this can never overwrite a code that some other
 * pass already decided on, which is the one thing an in-place UPDATE on an
 * append-only table must not be able to do.
 *
 * Returns whether a row actually changed, so a run can report filled and
 * already-filled separately instead of counting both as work.
 */
export function attachCode(
  db: DatabaseSync,
  key: { seller: string; sellerSku: string; seenOn: string },
  code: string,
  joinMethod: JoinMethod,
): boolean {
  const r = db
    .prepare(
      `UPDATE observation
          SET code = ?, join_method = ?
        WHERE seller = ? AND seller_sku = ? AND seen_on = ? AND code IS NULL`,
    )
    .run(code, joinMethod, key.seller, key.sellerSku, key.seenOn);
  return Number(r.changes) === 1;
}

/** How many rows are joined, unjoined-and-rejoinable, and unjoined-with-no-barcode. */
export function joinState(db: DatabaseSync, seller: string): {
  readonly joined: number;
  readonly rejoinable: number;
  readonly noBarcode: number;
} {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN code IS NOT NULL THEN 1 ELSE 0 END) AS joined,
         SUM(CASE WHEN code IS NULL AND page_gtin IS NOT NULL THEN 1 ELSE 0 END) AS rejoinable,
         SUM(CASE WHEN code IS NULL AND page_gtin IS NULL THEN 1 ELSE 0 END) AS no_barcode
       FROM observation WHERE seller = ?`,
    )
    .get(seller) as unknown as { joined: number | null; rejoinable: number | null; no_barcode: number | null };
  return {
    joined: row.joined ?? 0,
    rejoinable: row.rejoinable ?? 0,
    noBarcode: row.no_barcode ?? 0,
  };
}
