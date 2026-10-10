/**
 * The one intake path, 2026-10-09. Requirements 4.1, 4.2 and 4.4 of
 * docs/price-category-requirements-2026-10-01.md; plan
 * docs/price-category-plan-2026-10-02.md, Part 6, section 4.
 *
 *   4.1  One standard record (`ObservationRow`, store.ts), one reader per
 *        source. A reader is a `SourceReader`: a seller name, a declaration of
 *        which fields it supplies, and a `read()` that yields rows. `runIntake`
 *        takes any reader and needs nothing else, so a new source is a new
 *        reader and no other change (test/intake-one-format.test.ts proves it
 *        with two toy readers that exist only in the test).
 *
 *   4.2  Keep everything. Every batch is reconciled: rows offered by the
 *        reader against rows the append-only observation_log received for the
 *        batch, plus any delete during the batch. A mismatch is written to the
 *        ledger (intake_batch_close) and then thrown, with counts and example
 *        keys. `assertNothingLost` runs the same audit over the whole database.
 *        Outliers are flagged by a robust score into observation_outlier and
 *        never removed from anything.
 *
 *   4.4  Each reader declares, per field (date, region, store, city, OSM id),
 *        'always', 'when_known' or 'never'. A null in an 'always' field or a
 *        value in a 'never' field fails the batch loudly; 'when_known' fields
 *        are measured and reported. The declaration is stored on the batch, so
 *        the database-wide check (`assertSourceFields`) learns a new source's
 *        declaration from the ledger, not from an edit to this file.
 *        `LEGACY_SUPPLIES` declares the readers written before this path existed.
 *
 * Every failure here throws or is written to the ledger and then thrown.
 * Nothing is caught and absorbed: every catch block below records or undoes the
 * partial write and rethrows.
 */

import type { DatabaseSync } from 'node:sqlite';
import { KEEP_TRIGGERS, recordObservation, type ObservationRow } from './store.ts';
import { requireSourceUse, type SourceAccess } from './registry.ts';

/* ------------------------------------------------------------ declarations */

/** 'always': on every row. 'when_known': on some rows, null rate reported. 'never': not published by the source. */
export type FieldSupply = 'always' | 'when_known' | 'never';

/** The fields requirement 4.4 names: store, region and date (store as name, city and OSM id). */
export const DECLARED_FIELDS = ['seenOn', 'region', 'storeName', 'storeCity', 'storeOsm'] as const;
export type DeclaredField = (typeof DECLARED_FIELDS)[number];
export type Supplies = Readonly<Record<DeclaredField, FieldSupply>>;

const COLUMN: Record<DeclaredField, string> = {
  seenOn: 'seen_on',
  region: 'region',
  storeName: 'store_name',
  storeCity: 'store_city',
  storeOsm: 'store_osm',
};

const SUPPLY_VALUES: readonly FieldSupply[] = ['always', 'when_known', 'never'];

/** A declaration that asserts nothing beyond a date. For tests and for a source still being measured. */
export const ALL_WHEN_KNOWN: Supplies = {
  seenOn: 'always',
  region: 'when_known',
  storeName: 'when_known',
  storeCity: 'when_known',
  storeOsm: 'when_known',
};

/**
 * The readers written before this intake path, declared from each one's own
 * row builder as read on 2026-10-09. A reader that goes through `runIntake`
 * carries its declaration itself and needs no entry here.
 *
 *   Walmart        crawl.ts writes region/store null (one national price);
 *                  capture-printout.ts writes the store name when the printout
 *                  names one, under the same seller. So storeName is when_known.
 *   Canadian Tire  canadiantire-run.ts observationFrom: region null, no store.
 *   Save-On-Foods  saveonfoods-run.ts observationOf: region = province, store
 *                  name and city on every row, storeOsm null. The Store type
 *                  allows a null city/province; none of the 187 rows held on
 *                  2026-10-09 has one, so 'always' stands until a row says not.
 *   openprices     openprices.ts: region, store name, city and OSM id only when
 *                  the location is a shop.
 *   bcldb, anbl    provincial price lists: region fixed, no store.
 */
export const LEGACY_SUPPLIES: Readonly<Record<string, Supplies>> = {
  Walmart: { seenOn: 'always', region: 'never', storeName: 'when_known', storeCity: 'never', storeOsm: 'never' },
  'Canadian Tire': { seenOn: 'always', region: 'never', storeName: 'never', storeCity: 'never', storeOsm: 'never' },
  'Save-On-Foods': { seenOn: 'always', region: 'always', storeName: 'always', storeCity: 'always', storeOsm: 'never' },
  openprices: { seenOn: 'always', region: 'when_known', storeName: 'when_known', storeCity: 'when_known', storeOsm: 'when_known' },
  bcldb: { seenOn: 'always', region: 'always', storeName: 'never', storeCity: 'never', storeOsm: 'never' },
  anbl: { seenOn: 'always', region: 'always', storeName: 'never', storeCity: 'never', storeOsm: 'never' },
};

/** Throws unless `supplies` declares every field with a known value. */
export function validateSupplies(seller: string, supplies: unknown): asserts supplies is Supplies {
  if (typeof supplies !== 'object' || supplies === null) throw new Error(`${seller}: a reader must declare what it supplies`);
  const missing = DECLARED_FIELDS.filter((f) => !SUPPLY_VALUES.includes((supplies as Record<string, FieldSupply>)[f]));
  if (missing.length > 0) {
    throw new Error(`${seller}: a reader must declare what it supplies; no valid declaration for ${missing.join(', ')}`);
  }
}

/* ------------------------------------------------------------ field check */

export class SourceFieldError extends Error {
  override name = 'SourceFieldError';
}

interface FieldTally {
  rows: number;
  bad: Record<DeclaredField, { n: number; examples: string[] }>;
}

function newTally(): FieldTally {
  const bad = {} as FieldTally['bad'];
  for (const f of DECLARED_FIELDS) bad[f] = { n: 0, examples: [] };
  return { rows: 0, bad };
}

function keyOf(r: { seller: string; sellerSku: string; seenOn: string }): string {
  return `${r.seller}|${r.sellerSku}|${r.seenOn}`;
}

function tallyRow(t: FieldTally, supplies: Supplies, row: ObservationRow): void {
  t.rows += 1;
  for (const f of DECLARED_FIELDS) {
    const v = row[f];
    const empty = v === null || v === undefined || v === '';
    const wrong = (supplies[f] === 'always' && empty) || (supplies[f] === 'never' && !empty);
    if (!wrong) continue;
    t.bad[f].n += 1;
    if (t.bad[f].examples.length < 5) t.bad[f].examples.push(keyOf(row));
  }
}

function tallyProblems(seller: string, supplies: Supplies, t: FieldTally): string[] {
  const out: string[] = [];
  for (const f of DECLARED_FIELDS) {
    const b = t.bad[f];
    if (b.n === 0) continue;
    const what = supplies[f] === 'always' ? 'null' : 'filled';
    out.push(`${seller} ${f}: ${b.n} of ${t.rows} rows ${what}, declared ${supplies[f]}; e.g. ${b.examples.join(', ')}`);
  }
  return out;
}

/** Requirement 4.4 over a set of rows: throws SourceFieldError naming each broken field, its count and examples. */
export function checkDeclaredFields(seller: string, supplies: Supplies, rows: Iterable<ObservationRow>): void {
  validateSupplies(seller, supplies);
  const t = newTally();
  for (const r of rows) tallyRow(t, supplies, r);
  const problems = tallyProblems(seller, supplies, t);
  if (problems.length > 0) throw new SourceFieldError(`declared fields missing or stale:\n  ${problems.join('\n  ')}`);
}

export interface FieldRate {
  readonly seller: string;
  readonly field: DeclaredField;
  readonly supply: FieldSupply | 'undeclared';
  readonly rows: number;
  readonly nulls: number;
  readonly ok: boolean;
}

/** Each source's latest declaration on the ledger, over the legacy ones. */
export function declarationsInUse(db: DatabaseSync): Record<string, Supplies> {
  const out: Record<string, Supplies> = { ...LEGACY_SUPPLIES };
  const rows = db
    .prepare('SELECT seller, supplies_json FROM intake_batch WHERE id IN (SELECT MAX(id) FROM intake_batch GROUP BY seller)')
    .all() as unknown as { seller: string; supplies_json: string }[];
  for (const r of rows) {
    const s = JSON.parse(r.supplies_json) as unknown;
    validateSupplies(r.seller, s);
    out[r.seller] = s;
  }
  return out;
}

/** The null rate per source per declared field, over the current observation table. */
export function sourceFieldReport(db: DatabaseSync, declarations?: Readonly<Record<string, Supplies>>): FieldRate[] {
  const decls = declarations ?? declarationsInUse(db);
  const sums = DECLARED_FIELDS.map((f) => `SUM(CASE WHEN ${COLUMN[f]} IS NULL OR ${COLUMN[f]} = '' THEN 1 ELSE 0 END) AS ${f}`).join(', ');
  const rows = db
    .prepare(`SELECT seller, COUNT(*) AS n, ${sums} FROM observation GROUP BY seller ORDER BY seller`)
    .all() as unknown as ({ seller: string; n: number } & Record<DeclaredField, number>)[];
  const out: FieldRate[] = [];
  for (const r of rows) {
    const d = decls[r.seller];
    for (const f of DECLARED_FIELDS) {
      const nulls = Number(r[f]);
      const rowsN = Number(r.n);
      const supply = d ? d[f] : 'undeclared';
      const ok = supply === 'always' ? nulls === 0 : supply === 'never' ? nulls === rowsN : supply === 'when_known';
      out.push({ seller: r.seller, field: f, supply, rows: rowsN, nulls, ok });
    }
  }
  return out;
}

/** Throws, listing every source and field that breaks its declaration, and every seller with none. */
export function assertSourceFields(db: DatabaseSync, declarations?: Readonly<Record<string, Supplies>>): FieldRate[] {
  const rep = sourceFieldReport(db, declarations);
  const problems: string[] = [];
  const undeclared = new Set<string>();
  for (const r of rep) {
    if (r.ok) continue;
    if (r.supply === 'undeclared') {
      if (!undeclared.has(r.seller)) problems.push(`${r.seller}: ${r.rows} rows and no declaration of what it supplies`);
      undeclared.add(r.seller);
    } else if (r.supply === 'always') {
      problems.push(`${r.seller} ${r.field}: ${r.nulls} of ${r.rows} null, declared always`);
    } else {
      problems.push(`${r.seller} ${r.field}: ${r.rows - r.nulls} of ${r.rows} filled, declared never`);
    }
  }
  if (problems.length > 0) throw new SourceFieldError(`source fields do not match their declarations:\n  ${problems.join('\n  ')}`);
  return rep;
}

/* ------------------------------------------------------------ batches */

export class IntakeMismatchError extends Error {
  override name = 'IntakeMismatchError';
}

export interface Batch {
  readonly id: number;
  readonly seller: string;
  readonly supplies: Supplies;
  readonly logFloor: number;
  /** Offered keys, as a multiset: one key offered twice is two rows in. */
  readonly offered: Map<string, number>;
  offeredCount: number;
  readonly fields: FieldTally;
  closed: boolean;
}

export type BatchStatus = 'ok' | 'mismatch' | 'field_mismatch' | 'failed';

export interface BatchSummary {
  readonly batchId: number;
  readonly seller: string;
  readonly offered: number;
  readonly stored: number;
  readonly deletions: number;
  readonly status: BatchStatus;
  readonly detail: string | null;
}

function maxLogId(db: DatabaseSync): number {
  return Number((db.prepare('SELECT COALESCE(MAX(log_id), 0) AS m FROM observation_log').get() as { m: number }).m);
}

export function openBatch(db: DatabaseSync, seller: string, supplies: Supplies): Batch {
  if (typeof seller !== 'string' || seller.trim() === '') throw new Error('a batch needs a seller name');
  validateSupplies(seller, supplies);
  const logFloor = maxLogId(db);
  const r = db
    .prepare('INSERT INTO intake_batch (seller, supplies_json, log_floor, opened_at) VALUES (?,?,?,?)')
    .run(seller, JSON.stringify(supplies), logFloor, new Date().toISOString());
  return {
    id: Number(r.lastInsertRowid),
    seller,
    supplies,
    logFloor,
    offered: new Map(),
    offeredCount: 0,
    fields: newTally(),
    closed: false,
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Count one row in. Throws at once on a row no batch of this seller could store honestly. */
export function offer(b: Batch, row: ObservationRow): void {
  if (b.closed) throw new Error(`batch ${b.id} (${b.seller}) is closed; nothing more can be offered to it`);
  if (row.seller !== b.seller) {
    throw new Error(`batch ${b.id} is for seller ${b.seller} and was offered a row for seller ${row.seller} (${keyOf(row)})`);
  }
  if (typeof row.seenOn !== 'string' || !ISO_DAY.test(row.seenOn)) {
    throw new Error(`${b.seller}: seenOn must be an ISO day, got ${JSON.stringify(row.seenOn)} (${row.sellerSku})`);
  }
  const k = keyOf(row);
  b.offered.set(k, (b.offered.get(k) ?? 0) + 1);
  b.offeredCount += 1;
  tallyRow(b.fields, b.supplies, row);
}

/** Write one row and link it to the log row the trigger made for it. Throws if the log did not receive it. */
export function storeInBatch(db: DatabaseSync, b: Batch, row: ObservationRow): void {
  if (b.closed) throw new Error(`batch ${b.id} (${b.seller}) is closed; nothing more can be stored in it`);
  if (row.seller !== b.seller) {
    throw new Error(`batch ${b.id} is for seller ${b.seller} and was asked to store a row for seller ${row.seller} (${keyOf(row)})`);
  }
  db.exec('SAVEPOINT intake_row');
  try {
    const before = maxLogId(db);
    recordObservation(db, row);
    const log = db
      .prepare(
        `SELECT MAX(log_id) AS id FROM observation_log
          WHERE seller = ? AND seller_sku = ? AND seen_on = ? AND log_id > ? AND event IN ('insert','update')`,
      )
      .get(row.seller, row.sellerSku, row.seenOn, before) as { id: number | null };
    if (log.id === null) {
      throw new Error(`observation_log received nothing for ${keyOf(row)}: the keep-everything triggers are missing or broken`);
    }
    db.prepare('INSERT INTO intake_batch_row (batch_id, log_id) VALUES (?,?)').run(b.id, log.id);
    db.exec('RELEASE intake_row');
  } catch (e) {
    db.exec('ROLLBACK TO intake_row');
    db.exec('RELEASE intake_row');
    throw e;
  }
}

/**
 * Reconcile and close. Count stored is read from the database (the log rows
 * linked to this batch), not from a counter kept here, so a write that never
 * reached the log is a mismatch. The close row goes on the ledger first; then
 * anything wrong is thrown. `failure` closes a batch whose reader threw: the
 * ledger records it as 'failed' and the caller rethrows.
 */
export function closeBatch(db: DatabaseSync, b: Batch, failure?: unknown): BatchSummary {
  if (b.closed) throw new Error(`batch ${b.id} (${b.seller}) is already closed`);
  b.closed = true;
  const stored = db
    .prepare(
      `SELECT l.seller, l.seller_sku, l.seen_on FROM intake_batch_row r
         JOIN observation_log l ON l.log_id = r.log_id WHERE r.batch_id = ?`,
    )
    .all(b.id) as unknown as { seller: string; seller_sku: string; seen_on: string }[];
  const storedKeys = new Map<string, number>();
  for (const s of stored) {
    const k = `${s.seller}|${s.seller_sku}|${s.seen_on}`;
    storedKeys.set(k, (storedKeys.get(k) ?? 0) + 1);
  }
  const deleted = db
    .prepare("SELECT seller, seller_sku, seen_on FROM observation_log WHERE event = 'delete' AND log_id > ? ORDER BY log_id")
    .all(b.logFloor) as unknown as { seller: string; seller_sku: string; seen_on: string }[];

  const notStored: string[] = [];
  for (const [k, n] of b.offered) for (let i = (storedKeys.get(k) ?? 0); i < n; i++) notStored.push(k);
  const notOffered: string[] = [];
  for (const [k, n] of storedKeys) for (let i = (b.offered.get(k) ?? 0); i < n; i++) notOffered.push(k);

  const problems: string[] = [];
  if (b.offeredCount !== stored.length || notStored.length > 0 || notOffered.length > 0) {
    problems.push(`offered ${b.offeredCount}, stored ${stored.length}`);
    if (notStored.length > 0) problems.push(`offered but not stored (${notStored.length}): ${notStored.slice(0, 5).join(', ')}`);
    if (notOffered.length > 0) problems.push(`stored but never offered (${notOffered.length}): ${notOffered.slice(0, 5).join(', ')}`);
  }
  if (deleted.length > 0) {
    problems.push(
      `${deleted.length} deletion${deleted.length === 1 ? '' : 's'} from observation during the batch: ` +
        deleted.slice(0, 5).map((d) => `${d.seller}|${d.seller_sku}|${d.seen_on}`).join(', '),
    );
  }
  const fieldProblems = tallyProblems(b.seller, b.supplies, b.fields);

  let status: BatchStatus;
  let detail: string | null;
  if (failure !== undefined) {
    status = 'failed';
    const msg = failure instanceof Error ? failure.message : String(failure);
    detail = [`reader failed: ${msg}`, ...problems, ...fieldProblems].join('; ');
  } else if (problems.length > 0) {
    status = 'mismatch';
    detail = [...problems, ...fieldProblems].join('; ');
  } else if (fieldProblems.length > 0) {
    status = 'field_mismatch';
    detail = fieldProblems.join('; ');
  } else {
    status = 'ok';
    detail = null;
  }
  db.prepare(
    'INSERT INTO intake_batch_close (batch_id, offered, stored, deletions, status, detail, closed_at) VALUES (?,?,?,?,?,?,?)',
  ).run(b.id, b.offeredCount, stored.length, deleted.length, status, detail, new Date().toISOString());

  const summary: BatchSummary = {
    batchId: b.id,
    seller: b.seller,
    offered: b.offeredCount,
    stored: stored.length,
    deletions: deleted.length,
    status,
    detail,
  };
  if (status === 'mismatch') throw new IntakeMismatchError(`${b.seller} batch ${b.id}: ${detail}`);
  if (status === 'field_mismatch') throw new SourceFieldError(`${b.seller} batch ${b.id}: ${detail}`);
  return summary;
}

/* ------------------------------------------------------------ the one path */

/** One reader per source. `read` may return any iterable of rows, sync or async. */
export interface SourceReader {
  readonly seller: string;
  readonly supplies: Supplies;
  /**
   * How the source is read (requirement 4.8, registry.ts): 'automated' (a
   * program reads the site) or 'by_hand' (pages a person browsed and saved).
   * Undeclared means automated, the stricter of the two.
   */
  readonly access?: SourceAccess;
  read(): Iterable<ObservationRow> | AsyncIterable<ObservationRow>;
}

export interface IntakeResult extends BatchSummary {
  readonly outliersFlagged: number;
}

/**
 * Run one reader end to end: open a batch, offer and store each row, reconcile,
 * then flag outliers among the items it touched. Rows stored before a failure
 * are kept (nothing is rolled back: keeping everything includes a half batch),
 * the failure is on the ledger, and it is thrown.
 */
export async function runIntake(db: DatabaseSync, reader: SourceReader, opts: { on?: string } = {}): Promise<IntakeResult> {
  if (typeof reader?.seller !== 'string' || reader.seller.trim() === '') throw new Error('a reader needs a seller name');
  validateSupplies(reader.seller, reader.supplies);
  if (typeof reader.read !== 'function') throw new Error(`${reader.seller}: a reader needs a read() function`);
  const on = opts.on ?? new Date().toISOString().slice(0, 10);
  // Requirement 4.8: no reader runs without a recorded basis, and no automated
  // reader runs on a source whose basis forbids one. Before the batch opens and
  // before read() is called, so a refused source never touches the site.
  requireSourceUse(db, reader.seller, reader.access ?? 'automated');

  const b = openBatch(db, reader.seller, reader.supplies);
  const items = new Set<string>();
  try {
    for await (const row of reader.read()) {
      offer(b, row);
      storeInBatch(db, b, row);
      items.add(itemKeyOf(row.code, row.seller, row.sellerSku));
    }
  } catch (e) {
    const s = closeBatch(db, b, e);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${reader.seller} batch ${b.id} failed after offered ${s.offered}, stored ${s.stored}: ${msg}`, { cause: e });
  }
  const summary = closeBatch(db, b);
  const flags = items.size === 0 ? [] : flagOutliers(db, { on, items });
  return { ...summary, outliersFlagged: flags.length };
}

/* ------------------------------------------------------------ nothing lost */

export interface KeepReport {
  readonly currentRows: number;
  readonly logRows: number;
  readonly deletions: number;
  /** Current rows with no version in the log at all. */
  readonly unlogged: number;
  /** Current rows whose latest logged version is a delete or carries a different price. */
  readonly divergent: number;
}

/** The whole-database audit for requirement 4.2. Throws with counts and examples on any loss. */
export function assertNothingLost(db: DatabaseSync): KeepReport {
  const triggers = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'observation'").all() as unknown as {
      name: string;
    }[]).map((t) => t.name),
  );
  const missing = KEEP_TRIGGERS.filter((t) => !triggers.has(t));
  if (missing.length > 0) throw new Error(`keep-everything triggers missing on observation: ${missing.join(', ')}`);

  const n = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
  const currentRows = n('SELECT COUNT(*) AS n FROM observation');
  const logRows = n('SELECT COUNT(*) AS n FROM observation_log');
  const deleted = db
    .prepare("SELECT seller, seller_sku, seen_on, price_cents FROM observation_log WHERE event = 'delete' ORDER BY log_id")
    .all() as unknown as { seller: string; seller_sku: string; seen_on: string; price_cents: number }[];
  const unloggedRows = db
    .prepare(
      `SELECT o.seller, o.seller_sku, o.seen_on FROM observation o
        WHERE NOT EXISTS (SELECT 1 FROM observation_log l
                           WHERE l.seller = o.seller AND l.seller_sku = o.seller_sku AND l.seen_on = o.seen_on)`,
    )
    .all() as unknown as { seller: string; seller_sku: string; seen_on: string }[];
  const divergentRows = db
    .prepare(
      `SELECT o.seller, o.seller_sku, o.seen_on FROM observation o
         JOIN (SELECT seller, seller_sku, seen_on, MAX(log_id) AS last FROM observation_log GROUP BY seller, seller_sku, seen_on) m
           ON m.seller = o.seller AND m.seller_sku = o.seller_sku AND m.seen_on = o.seen_on
         JOIN observation_log l ON l.log_id = m.last
        WHERE l.event = 'delete' OR l.price_cents IS NOT o.price_cents`,
    )
    .all() as unknown as { seller: string; seller_sku: string; seen_on: string }[];

  const ex = (rows: readonly { seller: string; seller_sku: string; seen_on: string }[]) =>
    rows.slice(0, 5).map((r) => `${r.seller}|${r.seller_sku}|${r.seen_on}`).join(', ');
  const problems: string[] = [];
  if (deleted.length > 0) {
    problems.push(`${deleted.length} deletion${deleted.length === 1 ? '' : 's'} from observation (each row is still whole in observation_log): ${ex(deleted)}`);
  }
  if (unloggedRows.length > 0) problems.push(`${unloggedRows.length} current rows with no version in observation_log: ${ex(unloggedRows)}`);
  if (divergentRows.length > 0) problems.push(`${divergentRows.length} current rows that differ from their last logged version: ${ex(divergentRows)}`);
  if (problems.length > 0) throw new Error(`keep-everything audit failed (${currentRows} current rows, ${logRows} logged):\n  ${problems.join('\n  ')}`);
  return { currentRows, logRows, deletions: 0, unlogged: 0, divergent: 0 };
}

/* ------------------------------------------------------------ outliers */

/**
 * Robust outlier score on log price within one item. Iglewicz and Hoaglin's
 * modified z-score: 0.6745 * (x - median) / MAD, flagged above 3.5. When the
 * MAD is 0 (most prices identical) the mean absolute deviation stands in,
 * scaled by 1.253314, the usual fallback; when that is 0 too, every price is
 * the same and nothing is flagged. The scale never drops below
 * OUTLIER_MIN_SCALE. Fewer than MIN_OUTLIER_GROUP positive prices
 * is too few to call anything odd, and is not scored.
 *
 * An item is its catalogue code; an unjoined row is its own seller and sku.
 */
export const OUTLIER_Z = 3.5;
export const MIN_OUTLIER_GROUP = 4;
/**
 * The floor under the scale, in log price: the same 0.05 estimate.ts puts under
 * every spread (MIN_SIGMA; a test holds the two equal). Without it, an item
 * whose prices are mostly identical has a scale near zero and a 2% change
 * scores as an outlier - measured on the real data 2026-10-09, $10.79 against a
 * $10.99 median at z 4.8. With it, a flag needs a move of about 19% or more.
 */
export const OUTLIER_MIN_SCALE = 0.05;

export interface OutlierFlag {
  readonly itemKey: string;
  readonly seller: string;
  readonly sellerSku: string;
  readonly seenOn: string;
  readonly priceCents: number;
  readonly medianCents: number | null;
  readonly score: number;
  readonly reason: 'robust_z' | 'nonpositive_price';
}

function itemKeyOf(code: string | null, seller: string, sellerSku: string): string {
  return code ?? `${seller}|${sellerSku}`;
}

function median(sorted: readonly number[]): number {
  const m = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

/** Score the current rows (optionally only some items), hold the flags in observation_outlier, return them. */
export function flagOutliers(db: DatabaseSync, opts: { on: string; items?: ReadonlySet<string> }): OutlierFlag[] {
  const rows = db
    .prepare('SELECT code, seller, seller_sku, seen_on, price_cents FROM observation')
    .all() as unknown as { code: string | null; seller: string; seller_sku: string; seen_on: string; price_cents: number }[];
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = itemKeyOf(r.code, r.seller, r.seller_sku);
    if (opts.items && !opts.items.has(k)) continue;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const flags: OutlierFlag[] = [];
  let scored = 0;
  for (const [itemKey, g] of groups) {
    const positive = g.filter((r) => r.price_cents > 0);
    for (const r of g) {
      if (r.price_cents > 0) continue;
      flags.push({ itemKey, seller: r.seller, sellerSku: r.seller_sku, seenOn: r.seen_on, priceCents: r.price_cents, medianCents: null, score: Number.POSITIVE_INFINITY, reason: 'nonpositive_price' });
    }
    if (positive.length < MIN_OUTLIER_GROUP) continue;
    scored += positive.length;
    const logs = positive.map((r) => Math.log(r.price_cents));
    const med = median([...logs].sort((a, b) => a - b));
    const dev = logs.map((x) => Math.abs(x - med));
    const mad = median([...dev].sort((a, b) => a - b));
    let scale: number;
    if (mad > 0) scale = mad / 0.6745;
    else {
      const meanAd = dev.reduce((s, d) => s + d, 0) / dev.length;
      if (meanAd === 0) continue;
      scale = 1.253314 * meanAd;
    }
    scale = Math.max(scale, OUTLIER_MIN_SCALE);
    positive.forEach((r, i) => {
      const z = (logs[i]! - med) / scale;
      if (Math.abs(z) <= OUTLIER_Z) return;
      flags.push({ itemKey, seller: r.seller, sellerSku: r.seller_sku, seenOn: r.seen_on, priceCents: r.price_cents, medianCents: Math.exp(med), score: z, reason: 'robust_z' });
    });
  }
  flags.sort((a, b) => (a.itemKey < b.itemKey ? -1 : a.itemKey > b.itemKey ? 1 : a.priceCents - b.priceCents));

  db.exec('SAVEPOINT outliers');
  try {
    const run = db
      .prepare('INSERT INTO outlier_run (run_on, rows_scored, flagged) VALUES (?,?,?)')
      .run(opts.on, scored, flags.length);
    const runId = Number(run.lastInsertRowid);
    const ins = db.prepare(
      `INSERT INTO observation_outlier (run_id, seller, seller_sku, seen_on, item_key, price_cents, median_cents, score, reason)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    for (const f of flags) {
      ins.run(runId, f.seller, f.sellerSku, f.seenOn, f.itemKey, f.priceCents, f.medianCents, Number.isFinite(f.score) ? f.score : null, f.reason);
    }
    db.exec('RELEASE outliers');
  } catch (e) {
    db.exec('ROLLBACK TO outliers');
    db.exec('RELEASE outliers');
    throw e;
  }
  return flags;
}
