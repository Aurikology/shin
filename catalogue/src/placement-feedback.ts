/**
 * Shopper picks as placement evidence, and the 2.2 re-run schedule (price-category
 * requirement 2.4: "Record shopper picks and corrections as placement evidence, and
 * re-score as they accrue. Pass when 2.2 is re-run after every 500 new
 * confirmations").
 *
 *   node src/placement-feedback.ts ingest --db <catalogue.db> --scans <scans.db> [--origin scans]
 *   node src/placement-feedback.ts check  --db <catalogue.db>
 *
 * WHERE A CONFIRMATION COMES FROM. The app's POST /api/scan-pick stores, through
 * app/src/scans.ts `recordPick`, one append-only scan_pick row per pick: which
 * catalogue code the shopper chose from a list a scan offered. `ingestPicks` opens
 * that scan store READ ONLY and appends each pick it has not seen to
 * placement_confirmation here, with the scan's own query_text (what the shopper
 * typed or the reader read). A pick of a code that is no catalogue item is still a
 * confirmation and is counted; it is named in the result, never dropped.
 *
 * HOW IT FEEDS THE MATCH. A confirmation with text whose picked item is placed at a
 * category becomes a labelled example in the name-meaning index
 * (name-meaning.ts `confirmationExamples`): the next 2.2 re-run reads it.
 *
 * THE SCHEDULE. Every 500 confirmations need a 2.2 re-run. A re-run is recorded
 * (`recordRescore`, append-only placement_rescore) with the confirmation count it
 * saw. `assertRescoreNotOverdue` THROWS once 500 or more confirmations have accrued
 * since the last recorded re-run, and the `check` command exits 1, so an overdue
 * re-run is never silent (RULINGS.md, "Errors never go unnoticed").
 *
 * A re-run on shopper picks alone is not a random sample (shoppers confirm where
 * they choose to); 2.2's yardstick stays the random hand-checked sheet
 * (placement-audit.ts).
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const RESCORE_EVERY = 500;

export class RescoreOverdueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RescoreOverdueError';
  }
}

const DDL = `
CREATE TABLE IF NOT EXISTS placement_confirmation (
  id          INTEGER PRIMARY KEY,
  origin      TEXT NOT NULL,
  pick_id     INTEGER NOT NULL,
  code        TEXT NOT NULL,
  text        TEXT,
  picked_at   TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  UNIQUE (origin, pick_id)
) STRICT;
CREATE TRIGGER IF NOT EXISTS placement_confirmation_no_update BEFORE UPDATE ON placement_confirmation
BEGIN SELECT RAISE(ABORT, 'placement_confirmation: append-only, a row is never changed'); END;
CREATE TRIGGER IF NOT EXISTS placement_confirmation_no_delete BEFORE DELETE ON placement_confirmation
BEGIN SELECT RAISE(ABORT, 'placement_confirmation: append-only, a row is never deleted'); END;

CREATE TABLE IF NOT EXISTS placement_rescore (
  seq                INTEGER PRIMARY KEY AUTOINCREMENT,
  confirmations_seen INTEGER NOT NULL,
  what               TEXT NOT NULL,
  ran_at             TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS placement_rescore_no_update BEFORE UPDATE ON placement_rescore
BEGIN SELECT RAISE(ABORT, 'placement_rescore: append-only, a row is never changed'); END;
CREATE TRIGGER IF NOT EXISTS placement_rescore_no_delete BEFORE DELETE ON placement_rescore
BEGIN SELECT RAISE(ABORT, 'placement_rescore: append-only, a row is never deleted'); END;
`;

export function ensureFeedbackSchema(db: DatabaseSync): void {
  db.exec(DDL);
}

function hasTable(db: DatabaseSync, name: string): boolean {
  return db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !== undefined;
}

export interface Confirmation {
  readonly origin: string;
  readonly pickId: number;
  readonly code: string;
  readonly text: string | null;
  readonly pickedAt: string;
}

/** Appends one confirmation. Returns false when (origin, pickId) is already recorded. */
export function recordConfirmation(db: DatabaseSync, c: Confirmation, now: Date = new Date()): boolean {
  if (!c.origin || !Number.isInteger(c.pickId) || !c.code || !c.pickedAt) throw new Error(`recordConfirmation: incomplete confirmation ${JSON.stringify(c)}`);
  const r = db
    .prepare(`INSERT OR IGNORE INTO placement_confirmation (origin, pick_id, code, text, picked_at, ingested_at) VALUES (?,?,?,?,?,?)`)
    .run(c.origin, c.pickId, c.code, c.text && c.text.trim() !== '' ? c.text.trim() : null, c.pickedAt, now.toISOString());
  return Number(r.changes) === 1;
}

export interface IngestResult {
  readonly ingested: number;
  readonly alreadyHad: number;
  /** Picks of a code that is no catalogue item: confirmations all the same, named here. */
  readonly notInCatalogue: number;
  readonly notInCatalogueExamples: readonly string[];
}

/** Reads the app's scan_pick rows (READ ONLY) and appends the new ones as confirmations. */
export function ingestPicks(db: DatabaseSync, scansPath: string, opts: { readonly origin?: string } = {}): IngestResult {
  const origin = opts.origin ?? 'scans';
  if (!existsSync(scansPath)) throw new Error(`ingestPicks: scan store ${scansPath} does not exist`);
  ensureFeedbackSchema(db);
  const scans = new DatabaseSync(scansPath, { readOnly: true });
  try {
    if (!hasTable(scans, 'scan_pick')) throw new Error(`ingestPicks: ${scansPath} has no scan_pick table (is it the app's scan store?)`);
    const withText = hasTable(scans, 'scan');
    const after = (db.prepare('SELECT coalesce(max(pick_id), 0) AS m FROM placement_confirmation WHERE origin = ?').get(origin) as { m: number }).m;
    const rows = scans
      .prepare(
        withText
          ? `SELECT k.id, k.picked_code, k.picked_at, s.query_text FROM scan_pick k LEFT JOIN scan s ON s.id = k.scan_id WHERE k.id > ? ORDER BY k.id`
          : `SELECT id, picked_code, picked_at, NULL AS query_text FROM scan_pick WHERE id > ? ORDER BY id`,
      )
      .all(after) as unknown as { id: number; picked_code: string; picked_at: string; query_text: string | null }[];
    const isProduct = db.prepare('SELECT 1 FROM product WHERE code = ?');
    let ingested = 0;
    let alreadyHad = 0;
    let notInCatalogue = 0;
    const examples: string[] = [];
    db.exec('SAVEPOINT ingest');
    try {
      for (const r of rows) {
        if (recordConfirmation(db, { origin, pickId: r.id, code: r.picked_code, text: r.query_text, pickedAt: r.picked_at })) ingested += 1;
        else alreadyHad += 1;
        if (!isProduct.get(r.picked_code)) {
          notInCatalogue += 1;
          if (examples.length < 10) examples.push(r.picked_code);
        }
      }
      db.exec('RELEASE ingest');
    } catch (err) {
      db.exec('ROLLBACK TO ingest');
      db.exec('RELEASE ingest');
      throw err;
    }
    return { ingested, alreadyHad, notInCatalogue, notInCatalogueExamples: examples };
  } finally {
    scans.close();
  }
}

export function confirmationCount(db: DatabaseSync): number {
  if (!hasTable(db, 'placement_confirmation')) return 0;
  return (db.prepare('SELECT count(*) AS n FROM placement_confirmation').get() as { n: number }).n;
}

export function confirmationsSinceRescore(db: DatabaseSync): number {
  const total = confirmationCount(db);
  if (!hasTable(db, 'placement_rescore')) return total;
  const last = db.prepare('SELECT confirmations_seen FROM placement_rescore ORDER BY seq DESC LIMIT 1').get() as { confirmations_seen: number } | undefined;
  return total - (last?.confirmations_seen ?? 0);
}

/** Records that 2.2 was re-run with every confirmation so far in its index. */
export function recordRescore(db: DatabaseSync, what: string, now: Date = new Date()): void {
  ensureFeedbackSchema(db);
  if (!what.trim()) throw new Error('recordRescore: say what was re-run');
  db.prepare('INSERT INTO placement_rescore (confirmations_seen, what, ran_at) VALUES (?,?,?)').run(confirmationCount(db), what, now.toISOString());
}

/** Throws RescoreOverdueError once `every` or more confirmations have accrued since the last 2.2 re-run. */
export function assertRescoreNotOverdue(db: DatabaseSync, every = RESCORE_EVERY): { readonly since: number } {
  const since = confirmationsSinceRescore(db);
  if (since >= every) {
    throw new RescoreOverdueError(
      `2.4: ${since} confirmations since the last 2.2 re-run, the schedule is one re-run per ${every} confirmations: re-run the name-meaning match (placement-cascade) now`,
    );
  }
  return { since };
}

/** Confirmations with text: candidate labelled examples for the name-meaning index. */
export function confirmationExamples(db: DatabaseSync): { key: string; code: string; text: string }[] {
  if (!hasTable(db, 'placement_confirmation')) return [];
  return (db.prepare(`SELECT origin, pick_id, code, text FROM placement_confirmation WHERE text IS NOT NULL ORDER BY id`).all() as unknown as {
    origin: string;
    pick_id: number;
    code: string;
    text: string;
  }[]).map((r) => ({ key: `c:${r.origin}:${r.pick_id}`, code: r.code, text: r.text }));
}

/* ------------------------------------------------------------------- CLI */

function arg(name: string, argv: readonly string[]): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function main(argv: readonly string[]): number {
  const cmd = argv[0];
  const dbPath = arg('--db', argv);
  if (!dbPath || (cmd !== 'ingest' && cmd !== 'check')) {
    console.error('placement-feedback FAILED: usage: ingest --db <catalogue.db> --scans <scans.db> | check --db <catalogue.db>');
    return 2;
  }
  const db = new DatabaseSync(dbPath);
  try {
    if (cmd === 'ingest') {
      const scans = arg('--scans', argv);
      if (!scans) throw new Error('--scans <scans.db> is required');
      const r = ingestPicks(db, scans, { origin: arg('--origin', argv) ?? 'scans' });
      console.log(`placement-feedback: ${JSON.stringify(r)}`);
    }
    const { since } = assertRescoreNotOverdue(db);
    console.log(`placement-feedback: ${confirmationCount(db)} confirmations, ${since} since the last 2.2 re-run (one due every ${RESCORE_EVERY})`);
    return 0;
  } catch (err) {
    console.error(`placement-feedback FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
