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

import * as settings from '../../settings/src/index.ts';
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
  /**
   * The pre-tax, pre-deposit price, when the source publishes one separately
   * from what the customer pays. Added 2026-09-26 for New Brunswick's liquor
   * price list, whose "Base" column excludes HST while its "Price" column
   * (what `priceCents` holds) includes it - unlike British Columbia, whose
   * single published price has no HST folded in. The two provinces' numbers
   * must never be averaged against each other without this field, because
   * one would be comparing a tax-in figure to a tax-out one. Optional for the
   * same reason storeName is: a caller whose source publishes only one price
   * is not forced to invent a second. Omitted means the caller does not carry
   * a base price at all; present and null means the source has none for this
   * row.
   */
  readonly basePriceCents?: number | null;
  /*
   * THE PRINTOUT FIELDS, added 2026-09-28 for unit A1 of
   * docs/price-system-build-plan-2026-09-28.md (layer 2 of the three-layer
   * store). All optional, same rule as storeName: omitted means the caller's
   * source does not carry the thing, present and null means it does and this
   * row had none. capture-printout.ts fills them; no crawl caller passes them.
   */
  /** The store's own category for the page the row was read from, verbatim ("Pasta & Pasta Sauce"). */
  readonly storeCategory?: string | null;
  /** The "was" price printed next to a sale price, in cents. NULL when none was printed. */
  readonly wasCents?: number | null;
  /** 1 when the tile carried a sale mark (Rollback, Clearance, Reduced price) or a "was" price; 0 when it carried none. */
  readonly isSale?: number | null;
  /**
   * What `unitPriceCents` is per, normalised: '100g', '100ml', 'kg', 'l', 'lb', 'each'.
   * `unitLabel` keeps the unit price exactly as printed ("$2.62/100g"). A
   * printed unit price may be fractional cents (26.2¢/100g), so for these rows
   * `unitPriceCents` can hold a non-integer; SQLite keeps it as REAL.
   */
  readonly unitPricePer?: string | null;
  /** Brand / size / variant parsed from the name. Parsed, never printed: a guess the row can be argued out of. */
  readonly parsedBrand?: string | null;
  readonly parsedSize?: string | null;
  readonly parsedVariant?: string | null;
  /** The raw `capture_tile` this row was derived from. Set means the row is rebuildable from raw alone. */
  readonly captureTileId?: number | null;
  /** Path of the tile crop image, when one was saved. */
  readonly tileImage?: string | null;
  /**
   * Why this row should not be trusted as-is, as a JSON array of strings, or
   * NULL when nothing was flagged. A flagged row is labelled, not deleted
   * (Project Hammer's habit, cited in the build plan). E.g.
   * "unit_price_disagrees:..." when price / size and the printed unit price
   * disagree; `unitPriceCents` is then left NULL and only the printed text
   * survives in `unitLabel`, so nothing downstream uses it silently.
   */
  readonly flags?: string | null;
  /**
   * 1 only when a printout price passed EVERY positive check in
   * capture-printout.ts (one whole shelf-price token, in this tile alone, no
   * other money in the tile, no count / range / "from" / minus / US context,
   * visible and upright, above its own printed title, no flags). 0 otherwise,
   * and 0 for every row not derived from a printout. Downstream consumers read
   * only price_verified = 1 printout rows as price evidence; the rest is
   * training data. Added 2026-09-28 (third audit, the inverted model).
   */
  readonly priceVerified?: number | null;
}

/*
 * Why a raw product link did not become an observation row. Derived: replaced
 * wholesale on every derive, never hand-edited, so a table of an older shape is
 * simply dropped and recreated (see addMissingColumns). Store is in the key so
 * two stores' drops for one product and day never overwrite each other.
 */
const CAPTURE_DROP_DDL = `CREATE TABLE IF NOT EXISTS capture_drop (
  seller        TEXT NOT NULL,
  store         TEXT NOT NULL,
  retailer_product_id TEXT NOT NULL,
  seen_on       TEXT NOT NULL,
  capture_tile_id INTEGER,
  reason        TEXT NOT NULL,
  PRIMARY KEY (seller, store, retailer_product_id, seen_on)
);`;

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
  /*
   * The pre-tax, pre-deposit price, kept apart from price_cents (what the
   * customer pays). Added 2026-09-26; see ObservationRow.basePriceCents.
   */
  base_price_cents INTEGER,
  /*
   * Layer 2 printout fields, added 2026-09-28 (unit A1). See ObservationRow.
   * Existing databases get them from addMissingColumns, not from here.
   */
  store_category  TEXT,
  was_cents       INTEGER,
  is_sale         INTEGER,
  unit_price_per  TEXT,
  parsed_brand    TEXT,
  parsed_size     TEXT,
  parsed_variant  TEXT,
  capture_tile_id INTEGER,
  tile_image      TEXT,
  flags           TEXT,
  price_verified  INTEGER NOT NULL DEFAULT 0,
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

/*
 * ---------------------------------------------------------------------------
 * THE THREE-LAYER STORE, 2026-09-28 (unit A1, docs/price-system-build-plan-2026-09-28.md).
 *
 *   Layer 1, raw:         capture + capture_tile. What the saved page said, kept
 *                         unedited. The triggers below refuse UPDATE; rows can be
 *                         deleted (that is how the rebuild check is proved to go
 *                         red) but never rewritten.
 *   Layer 2, observation: the table above. Rows derived from raw carry
 *                         capture_tile_id and can be rebuilt from raw alone
 *                         (capture-printout.ts, checkRebuild).
 *   Layer 3, identity:    identity_link. Which barcode a seller's product is, how
 *                         that was found and how sure. Optional and replaceable,
 *                         and kept OFF the price row on purpose: a wrong match is
 *                         replaced by a new link, the price it pointed at is not
 *                         touched. observation.code is still the only column any
 *                         serving reader (range.ts, verdict.ts, lookup.ts, the
 *                         app) joins on, and nothing here writes it. Turning a
 *                         link into a served code changes answers, so it waits
 *                         for the test bench (plan, section B).
 * ---------------------------------------------------------------------------
 */
CREATE TABLE IF NOT EXISTS capture (
  id            INTEGER PRIMARY KEY,
  file_path     TEXT NOT NULL,
  /* The same file read twice is the same capture: intake is idempotent on this. */
  sha256        TEXT NOT NULL UNIQUE,
  source_kind   TEXT NOT NULL,
  seller        TEXT NOT NULL,
  /* 'unknown' is a real value: the 29 printouts do not show which store. */
  store         TEXT NOT NULL,
  /* The store's category as given at intake; NULL means read it from doc_title. */
  store_category TEXT,
  captured_at   TEXT NOT NULL,
  page_count    INTEGER NOT NULL,
  doc_title     TEXT,
  creation_date TEXT,
  /* Links on the pages that were not product links (navigation): counted, not stored. */
  other_links   INTEGER NOT NULL,
  ingested_at   TEXT NOT NULL,
  /*
   * One intake run (one CLI invocation, one person's session). With no store
   * given, captures of one run are treated as one unknown store.
   */
  intake_run    TEXT
);

CREATE TABLE IF NOT EXISTS capture_tile (
  id            INTEGER PRIMARY KEY,
  capture_id    INTEGER NOT NULL REFERENCES capture(id),
  page          INTEGER NOT NULL,
  x0 REAL NOT NULL, y0 REAL NOT NULL, x1 REAL NOT NULL, y1 REAL NOT NULL,
  retailer_product_id TEXT NOT NULL,
  retailer_url  TEXT NOT NULL,
  /* Every word whose centre is inside the link rectangle, verbatim, as the PDF reader gave it. */
  words_json    TEXT NOT NULL,
  tile_image    TEXT,
  /* Words touching the rectangle from outside (edge-crossing, or the rest of a block that starts inside). */
  near_json     TEXT
);

CREATE INDEX IF NOT EXISTS capture_tile_by_capture ON capture_tile(capture_id, page);

CREATE TRIGGER IF NOT EXISTS capture_is_raw BEFORE UPDATE ON capture
BEGIN SELECT RAISE(ABORT, 'capture is raw and is never edited'); END;
CREATE TRIGGER IF NOT EXISTS capture_tile_is_raw BEFORE UPDATE ON capture_tile
BEGIN SELECT RAISE(ABORT, 'capture_tile is raw and is never edited'); END;

/*
 * Which observation keys the printout intake itself wrote. Lets the rebuild
 * check tell "a crawl row held this key before intake" (expected) from "our
 * row was later unlinked or replaced by another writer" (a finding, red).
 */
CREATE TABLE IF NOT EXISTS capture_written (
  seller        TEXT NOT NULL,
  retailer_product_id TEXT NOT NULL,
  seen_on       TEXT NOT NULL,
  capture_tile_id INTEGER,
  written_at    TEXT NOT NULL,
  PRIMARY KEY (seller, retailer_product_id, seen_on)
);

/* Append-only, like raw: a ledger that can be edited cannot vouch for anything. */
CREATE TRIGGER IF NOT EXISTS capture_written_no_update BEFORE UPDATE ON capture_written
BEGIN SELECT RAISE(ABORT, 'capture_written is a ledger and is never edited'); END;
CREATE TRIGGER IF NOT EXISTS capture_written_no_delete BEFORE DELETE ON capture_written
BEGIN SELECT RAISE(ABORT, 'capture_written is a ledger and is never edited'); END;

${CAPTURE_DROP_DDL}

CREATE TABLE IF NOT EXISTS identity_link (
  id            INTEGER PRIMARY KEY,
  seller        TEXT NOT NULL,
  seller_sku    TEXT NOT NULL,
  barcode       TEXT NOT NULL,
  /* How it was found. Free text on purpose: 'retailer_page_upc', 'gtin', 'name', 'human', ... */
  join_method   TEXT NOT NULL,
  confidence    REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  found_on      TEXT NOT NULL,
  evidence      TEXT,
  /* NULL means current. A replaced link is kept, pointing at the link that replaced it. */
  replaced_by   INTEGER REFERENCES identity_link(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS identity_link_current
  ON identity_link(seller, seller_sku) WHERE replaced_by IS NULL;
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
  settings.SHIN_PRICES() ??
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
  if (!have.has('base_price_cents'))
    db.exec('ALTER TABLE observation ADD COLUMN base_price_cents INTEGER');
  // Layer 2 printout fields, 2026-09-28 (unit A1). All nullable, so ADD COLUMN
  // rewrites no row and every existing row reads NULL for them.
  for (const [name, type] of PRINTOUT_COLUMNS) {
    if (!have.has(name)) db.exec(`ALTER TABLE observation ADD COLUMN ${name} ${type}`);
  }
  // A constant default is allowed by ADD COLUMN: no row is rewritten, every existing row reads 0.
  if (!have.has('price_verified')) db.exec('ALTER TABLE observation ADD COLUMN price_verified INTEGER NOT NULL DEFAULT 0');
  const tileCols = new Set(
    (db.prepare('PRAGMA table_info(capture_tile)').all() as unknown as { name: string }[]).map((c) => c.name),
  );
  if (!tileCols.has('near_json')) db.exec('ALTER TABLE capture_tile ADD COLUMN near_json TEXT');
  const captureCols = new Set(
    (db.prepare('PRAGMA table_info(capture)').all() as unknown as { name: string }[]).map((c) => c.name),
  );
  if (!captureCols.has('intake_run')) db.exec('ALTER TABLE capture ADD COLUMN intake_run TEXT');
  const dropCols = new Set(
    (db.prepare('PRAGMA table_info(capture_drop)').all() as unknown as { name: string }[]).map((c) => c.name),
  );
  if (!dropCols.has('store')) {
    // Derived table, rebuilt on every derive: recreating it loses nothing raw holds.
    db.exec('DROP TABLE capture_drop');
    db.exec(CAPTURE_DROP_DDL);
  }
}

/** The columns unit A1 added to `observation`, in DDL order. Exported for the migration test. */
export const PRINTOUT_COLUMNS: readonly (readonly [string, string])[] = [
  ['store_category', 'TEXT'],
  ['was_cents', 'INTEGER'],
  ['is_sale', 'INTEGER'],
  ['unit_price_per', 'TEXT'],
  ['parsed_brand', 'TEXT'],
  ['parsed_size', 'TEXT'],
  ['parsed_variant', 'TEXT'],
  ['capture_tile_id', 'INTEGER'],
  ['tile_image', 'TEXT'],
  ['flags', 'TEXT'],
];

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
CREATE INDEX IF NOT EXISTS observation_by_capture_tile
  ON observation(capture_tile_id) WHERE capture_tile_id IS NOT NULL;
`;

export function openPrices(path: string = PRICES_DB_PATH): DatabaseSync {
  const db = new DatabaseSync(path);
  // Before anything writes (the migration below included): a second process
  // holding the file waits up to 5 s instead of failing the open with SQLITE_BUSY.
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(DDL);
  addMissingColumns(db);
  db.exec(REJOIN_INDEX);
  installKeepEverything(db);
  return db;
}

/*
 * ---------------------------------------------------------------------------
 * KEEP EVERYTHING, 2026-10-09. Requirement 4.2 of
 * docs/price-category-requirements-2026-10-01.md: keep every captured price
 * whole, delete nothing, and prove count in equals count stored.
 *
 * WHY IT IS ADDITIVE. `observation` is read by five readers outside the writer
 * (app/src/own-prices.ts, bench/src/harness.ts, range.ts, estimate.ts,
 * lookup.ts). Its columns, its key and what a reader gets from it stay exactly
 * as they were: one current row per (seller, seller_sku, seen_on). What changes
 * is that no version of a row can now vanish without a trace:
 *
 *   observation_log     every version any writer ever puts in `observation`,
 *                       copied by triggers (insert, update, and the old row on
 *                       a delete). Append-only: its own triggers refuse UPDATE
 *                       and DELETE. Triggers, not a line in recordObservation,
 *                       so a writer that goes around this file (a raw UPDATE, a
 *                       test fixture, a future script) is logged too.
 *   intake_batch,       the per-batch reconciliation ledger (intake.ts). One
 *   intake_batch_row,   row per batch opened, one per stored row linked to the
 *   intake_batch_close  log row it produced, one per batch closed with offered,
 *                       stored and status. All append-only.
 *   observation_outlier outliers held flagged, never dropped (intake.ts).
 *
 * The log's columns are not hand-listed: they are read from `observation` on
 * every open, missing ones are added, and the triggers are rebuilt whenever
 * their column list would differ. A column added to `observation` later can
 * therefore never be silently left out of the log, which is the same trap the
 * comment on recordObservation below describes for its own column list.
 *
 * Deletes on `observation` are LOGGED, not refused. A test fixture outside this
 * package (app/test/own-prices-printout.test.ts) deletes rows from a temp copy
 * on purpose, and refusing it would break a reader's test for no gain: the
 * deleted row is whole in the log either way. A delete on real data is caught
 * by intake.ts's assertNothingLost and by every batch close, loudly.
 * ---------------------------------------------------------------------------
 */

const KEEP_DDL = `
CREATE TABLE IF NOT EXISTS store_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observation_log (
  log_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  /* 'baseline' (held before the log existed), 'insert', 'update', 'delete' (the row as it was). */
  event     TEXT NOT NULL,
  logged_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER IF NOT EXISTS observation_log_no_update BEFORE UPDATE ON observation_log
BEGIN SELECT RAISE(ABORT, 'observation_log is append-only and is never edited'); END;
CREATE TRIGGER IF NOT EXISTS observation_log_no_delete BEFORE DELETE ON observation_log
BEGIN SELECT RAISE(ABORT, 'observation_log is append-only and is never edited'); END;

CREATE TABLE IF NOT EXISTS intake_batch (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  seller        TEXT NOT NULL,
  /* What the reader declared it supplies (requirement 4.4), as JSON. */
  supplies_json TEXT NOT NULL,
  /* The highest observation_log id when the batch opened: a delete above it happened during the batch. */
  log_floor     INTEGER NOT NULL,
  opened_at     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS intake_batch_row (
  batch_id INTEGER NOT NULL REFERENCES intake_batch(id),
  log_id   INTEGER NOT NULL REFERENCES observation_log(log_id),
  PRIMARY KEY (batch_id, log_id)
);
CREATE TABLE IF NOT EXISTS intake_batch_close (
  batch_id  INTEGER PRIMARY KEY REFERENCES intake_batch(id),
  offered   INTEGER NOT NULL,
  stored    INTEGER NOT NULL,
  deletions INTEGER NOT NULL,
  /* 'ok', 'mismatch' (counts or deletes), 'field_mismatch' (requirement 4.4), 'failed' (the reader threw). */
  status    TEXT NOT NULL,
  detail    TEXT,
  closed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outlier_run (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_on      TEXT NOT NULL,
  rows_scored INTEGER NOT NULL,
  flagged     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS observation_outlier (
  run_id       INTEGER NOT NULL REFERENCES outlier_run(id),
  seller       TEXT NOT NULL,
  seller_sku   TEXT NOT NULL,
  seen_on      TEXT NOT NULL,
  item_key     TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  median_cents REAL,
  score        REAL,
  reason       TEXT NOT NULL,
  PRIMARY KEY (run_id, seller, seller_sku, seen_on)
);
`;

const APPEND_ONLY = ['intake_batch', 'intake_batch_row', 'intake_batch_close', 'outlier_run', 'observation_outlier'] as const;

/** Exported for the tests and for intake.ts's audit: the triggers that make keeping everything true. */
export const KEEP_TRIGGERS = ['observation_logs_insert', 'observation_logs_update', 'observation_logs_delete'] as const;

function installKeepEverything(db: DatabaseSync): void {
  db.exec(KEEP_DDL);
  for (const t of APPEND_ONLY) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t}
             BEGIN SELECT RAISE(ABORT, '${t} is append-only and is never edited'); END;
             CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t}
             BEGIN SELECT RAISE(ABORT, '${t} is append-only and is never edited'); END;`);
  }

  const obsCols = (db.prepare('PRAGMA table_info(observation)').all() as unknown as { name: string; type: string }[]);
  const logCols = new Set(
    (db.prepare('PRAGMA table_info(observation_log)').all() as unknown as { name: string }[]).map((c) => c.name),
  );
  for (const c of obsCols) {
    if (!logCols.has(c.name)) db.exec(`ALTER TABLE observation_log ADD COLUMN "${c.name}" ${c.type}`);
  }
  // After the column sync: on a fresh log the key columns exist only from here on.
  db.exec('CREATE INDEX IF NOT EXISTS observation_log_by_key ON observation_log(seller, seller_sku, seen_on)');
  db.exec('CREATE INDEX IF NOT EXISTS observation_log_by_event ON observation_log(event)');
  const names = obsCols.map((c) => `"${c.name}"`);
  const list = names.join(', ');
  const want: Record<(typeof KEEP_TRIGGERS)[number], string> = {
    observation_logs_insert: `CREATE TRIGGER observation_logs_insert AFTER INSERT ON observation BEGIN INSERT INTO observation_log (event, ${list}) VALUES ('insert', ${names.map((n) => `NEW.${n}`).join(', ')}); END`,
    observation_logs_update: `CREATE TRIGGER observation_logs_update AFTER UPDATE ON observation BEGIN INSERT INTO observation_log (event, ${list}) VALUES ('update', ${names.map((n) => `NEW.${n}`).join(', ')}); END`,
    observation_logs_delete: `CREATE TRIGGER observation_logs_delete AFTER DELETE ON observation BEGIN INSERT INTO observation_log (event, ${list}) VALUES ('delete', ${names.map((n) => `OLD.${n}`).join(', ')}); END`,
  };
  const have = new Map(
    (db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'observation'").all() as unknown as {
      name: string;
      sql: string;
    }[]).map((t) => [t.name, t.sql]),
  );
  for (const name of KEEP_TRIGGERS) {
    if (have.get(name) === want[name]) continue;
    db.exec(`DROP TRIGGER IF EXISTS ${name}`);
    db.exec(want[name]);
  }

  // Rows held before the log existed are copied in once, as 'baseline'. Under
  // an immediate transaction with the flag re-read inside it, so two processes
  // opening the same file for the first time cannot both copy.
  const done = () => db.prepare("SELECT 1 FROM store_meta WHERE key = 'observation_log_baseline'").get() !== undefined;
  if (done()) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!done()) {
      const r = db.prepare(`INSERT INTO observation_log (event, ${list}) SELECT 'baseline', ${list} FROM observation`).run();
      db.prepare("INSERT INTO store_meta (key, value) VALUES ('observation_log_baseline', ?)").run(
        JSON.stringify({ rows: Number(r.changes), at: new Date().toISOString() }),
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/*
 * CHANGED 2026-10-09 (requirement 4.2): this was INSERT OR REPLACE, which
 * DELETES the existing row and inserts a fresh one. It is now an upsert that
 * overwrites every column of the existing row in place: what a reader gets is
 * identical (every one of the 33 columns is set from this call, exactly as
 * before), but no row is ever deleted to make room, and the version it replaces
 * is already whole in observation_log (logged when it was written). The note
 * below about the column list still holds, with one difference: a column left
 * out of the list now keeps its old value instead of reverting to NULL.
 *
 * INSERT OR REPLACE deletes the existing row and inserts a fresh one; it does
 * not merge. Any column that exists in the table but is missing from this
 * statement's column list silently reverts to its default (or NULL, now that
 * in_stock has none) on every re-crawl of an already-seen key. The three
 * store_* columns were added to the table in this same change; if a future
 * column is added to the table and not added here, in both the column list
 * and the values list and the bind arguments below, it will quietly wipe
 * itself out on the next INSERT OR REPLACE for that key. Count them: 33
 * columns, 33 placeholders, 33 bind arguments below. Keep the three counts
 * equal. (`page_gtin` was the 21st, added 2026-09-08; `base_price_cents` the
 * 22nd, added 2026-09-26; the ten printout columns, store_category through
 * flags, are the 23rd to 32nd, added 2026-09-28; price_verified is the 33rd.)
 */
export function recordObservation(db: DatabaseSync, o: ObservationRow): void {
  db.prepare(
    `INSERT INTO observation
       (code, seller, seller_sku, seller_name, seller_brand, price_cents, kind,
        unit_price_cents, unit_label, currency, country, region, join_method,
        seen_on, url, image_url, in_stock, store_name, store_city, store_osm,
        page_gtin, base_price_cents,
        store_category, was_cents, is_sale, unit_price_per, parsed_brand,
        parsed_size, parsed_variant, capture_tile_id, tile_image, flags, price_verified)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (seller, seller_sku, seen_on) DO UPDATE SET
         code = excluded.code,
         seller_name = excluded.seller_name,
         seller_brand = excluded.seller_brand,
         price_cents = excluded.price_cents,
         kind = excluded.kind,
         unit_price_cents = excluded.unit_price_cents,
         unit_label = excluded.unit_label,
         currency = excluded.currency,
         country = excluded.country,
         region = excluded.region,
         join_method = excluded.join_method,
         url = excluded.url,
         image_url = excluded.image_url,
         in_stock = excluded.in_stock,
         store_name = excluded.store_name,
         store_city = excluded.store_city,
         store_osm = excluded.store_osm,
         page_gtin = excluded.page_gtin,
         base_price_cents = excluded.base_price_cents,
         store_category = excluded.store_category,
         was_cents = excluded.was_cents,
         is_sale = excluded.is_sale,
         unit_price_per = excluded.unit_price_per,
         parsed_brand = excluded.parsed_brand,
         parsed_size = excluded.parsed_size,
         parsed_variant = excluded.parsed_variant,
         capture_tile_id = excluded.capture_tile_id,
         tile_image = excluded.tile_image,
         flags = excluded.flags,
         price_verified = excluded.price_verified`,
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
    o.basePriceCents ?? null,
    o.storeCategory ?? null,
    o.wasCents ?? null,
    o.isSale ?? null,
    o.unitPricePer ?? null,
    o.parsedBrand ?? null,
    o.parsedSize ?? null,
    o.parsedVariant ?? null,
    o.captureTileId ?? null,
    o.tileImage ?? null,
    o.flags ?? null,
    o.priceVerified ?? 0,
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

/**
 * Unjoined rows with no barcode on them, for the name leg of a nightly rejoin.
 *
 * Rows derived from a raw capture (capture_tile_id set, i.e. the store
 * printouts) are NOT returned, added 2026-09-28. Joining a printout row by
 * name IS the printout matcher, and that matcher failed its bar and is paused
 * (docs/screenshot-matcher-design-2026-09-28.md, version 1 results; Jamin
 * 2026-09-28). Without this line the first nightly name rejoin after a
 * printout intake would quietly run the paused matcher and write codes that
 * range.ts then serves. Their identity goes through `identity_link` instead.
 */
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
          AND capture_tile_id IS NULL
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

/*
 * ---------------------------------------------------------------------------
 * IDENTITY LINK, layer 3, 2026-09-28 (unit A1). Which barcode a seller's product
 * is, kept apart from every price row for that product.
 *
 * Keyed on (seller, seller_sku), not on a price row: a product's identity does
 * not change day to day, its price does. One CURRENT link per key; replacing it
 * inserts the new link and points the old one at it, so the history of what we
 * believed and why is never lost. Nothing here writes observation.code.
 * ---------------------------------------------------------------------------
 */

export interface IdentityLink {
  readonly id: number;
  readonly seller: string;
  readonly sellerSku: string;
  readonly barcode: string;
  readonly joinMethod: string;
  readonly confidence: number;
  readonly foundOn: string;
  readonly evidence: string | null;
  readonly replacedBy: number | null;
}

export type NewIdentityLink = Omit<IdentityLink, 'id' | 'replacedBy'>;

/** Record a link, replacing (not deleting) the current one for that product. Returns the new id. */
export function linkIdentity(db: DatabaseSync, link: NewIdentityLink): number {
  if (!(link.confidence >= 0 && link.confidence <= 1)) throw new Error(`confidence out of range: ${link.confidence}`);
  db.exec('BEGIN');
  try {
    const prior = db
      .prepare('SELECT id FROM identity_link WHERE seller = ? AND seller_sku = ? AND replaced_by IS NULL')
      .get(link.seller, link.sellerSku) as unknown as { id: number } | undefined;
    // The unique index allows one current link per key, so the old one steps
    // aside first (pointed at itself for the instant before the new id exists).
    if (prior) db.prepare('UPDATE identity_link SET replaced_by = id WHERE id = ?').run(prior.id);
    const r = db
      .prepare(
        `INSERT INTO identity_link (seller, seller_sku, barcode, join_method, confidence, found_on, evidence)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(link.seller, link.sellerSku, link.barcode, link.joinMethod, link.confidence, link.foundOn, link.evidence);
    const id = Number(r.lastInsertRowid);
    if (prior) db.prepare('UPDATE identity_link SET replaced_by = ? WHERE id = ?').run(id, prior.id);
    db.exec('COMMIT');
    return id;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function toLink(r: Record<string, unknown>): IdentityLink {
  return {
    id: Number(r.id),
    seller: String(r.seller),
    sellerSku: String(r.seller_sku),
    barcode: String(r.barcode),
    joinMethod: String(r.join_method),
    confidence: Number(r.confidence),
    foundOn: String(r.found_on),
    evidence: r.evidence === null ? null : String(r.evidence),
    replacedBy: r.replaced_by === null ? null : Number(r.replaced_by),
  };
}

/** The current link for a product, or null when none has been made. */
export function currentIdentity(db: DatabaseSync, seller: string, sellerSku: string): IdentityLink | null {
  const r = db
    .prepare('SELECT * FROM identity_link WHERE seller = ? AND seller_sku = ? AND replaced_by IS NULL')
    .get(seller, sellerSku) as Record<string, unknown> | undefined;
  return r ? toLink(r) : null;
}

/** Every link ever made for a product, oldest first, replaced ones included. */
export function identityHistory(db: DatabaseSync, seller: string, sellerSku: string): IdentityLink[] {
  return (
    db
      .prepare('SELECT * FROM identity_link WHERE seller = ? AND seller_sku = ? ORDER BY id')
      .all(seller, sellerSku) as Record<string, unknown>[]
  ).map(toLink);
}
