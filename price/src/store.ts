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
  /** ISO date, no time. One observation per seller per product per day is enough. */
  readonly seenOn: string;
  readonly url: string | null;
  readonly imageUrl: string | null;
  readonly inStock: number;
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
  in_stock        INTEGER NOT NULL DEFAULT 1,
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
   * The seller refused to answer. NOT a zero. A throttled row is retried and
   * must never sit in the denominator of a coverage figure, because doing so
   * reports our own request rate as a fact about what the seller stocks.
   */
  | 'throttled'
  | 'error';

export function openPrices(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(DDL);
  return db;
}

export function recordObservation(db: DatabaseSync, o: ObservationRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO observation
       (code, seller, seller_sku, seller_name, seller_brand, price_cents, kind,
        unit_price_cents, unit_label, currency, country, region, join_method,
        seen_on, url, image_url, in_stock)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    get('matched') + get('named') + get('no_candidates') + get('no_barcode_match');
  return {
    attempted: answered,
    matched: get('matched'),
    named: get('named'),
    noCandidates: get('no_candidates'),
    noBarcodeMatch: get('no_barcode_match'),
    throttled: get('throttled'),
    errors: get('error'),
  };
}
