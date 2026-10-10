/**
 * Whether the prices file the server opens can answer at all. D-231 (c).
 *
 * WHY. On the live Mac (2026-10-10, scans 88 to 92) the prices file opened
 * fine and held no `observation` table, so every range failed one scan at a
 * time with "no such table: observation", each failure caught and logged as
 * one more per-scan line. Pexi's own prices never reached a shopper, every
 * range shown was the Claude estimate, and nothing said so anywhere a person
 * looks first. RULINGS.md "Catalogue first" puts Pexi's own data first, so a
 * prices file that cannot answer is a named fault, never a quiet fallback:
 *
 *   - one loud line at startup (`checkPricesAtStart`), and
 *   - `/api/health` naming the state and counting the scans it touched
 *     (`pricesHealth`, fed by `notePricesOpened`).
 *
 * Nothing here changes an answer or invents a price: a scan priced against a
 * broken file still gets whatever the ladder can honestly give it.
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/** The table every price read starts from (price/src/store.ts). */
const OBSERVATION_TABLE = 'observation';

export type PricesDbState = 'ok' | 'missing' | 'unopenable' | 'no_observation_table';

/** Scans that were priced against a prices file in each non-ok state, since this process started. */
const faults: Partial<Record<Exclude<PricesDbState, 'ok'>, number>> = {};
let path: string | null = null;
let saidAtStart = false;

function hasObservation(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(OBSERVATION_TABLE);
  return row !== undefined;
}

/** What state the prices file at `file` is in, and why, in words. Never throws. */
export function inspectPricesDb(file: string): { state: PricesDbState; why: string } {
  if (!existsSync(file)) return { state: 'missing', why: `no prices file at ${file}` };
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    return hasObservation(db)
      ? { state: 'ok', why: '' }
      : { state: 'no_observation_table', why: `the prices file ${file} has no ${OBSERVATION_TABLE} table` };
  } catch (err) {
    return { state: 'unopenable', why: `the prices file ${file} will not open: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Called once when the server starts listening. A prices file that cannot
 * answer is said once, loudly, in a sentence naming what a shopper loses;
 * a second call says nothing (the count in `/api/health` carries it after).
 */
export function checkPricesAtStart(file: string, say: (line: string) => void = (l) => console.error(l)): PricesDbState {
  path = file;
  const { state, why } = inspectPricesDb(file);
  if (state !== 'ok' && !saidAtStart) {
    saidAtStart = true;
    say(`[prices-fault] ${state}: ${why}. Pexi's own prices will NOT reach any shopper; every range falls to the Claude estimate until this is fixed.`);
  }
  return state;
}

/**
 * Counts one scan priced against the prices file as opened (`db`, or null when
 * it did not open). Cheap: one lookup in sqlite_master. Never throws.
 */
export function notePricesOpened(db: DatabaseSync | null, file: string): void {
  path = file;
  let state: PricesDbState;
  if (db === null) state = existsSync(file) ? 'unopenable' : 'missing';
  else {
    try {
      state = hasObservation(db) ? 'ok' : 'no_observation_table';
    } catch {
      state = 'unopenable';
    }
  }
  if (state !== 'ok') faults[state] = (faults[state] ?? 0) + 1;
}

/** The fields `/api/health` adds: the prices file's state now, and the scans each fault touched. */
export function pricesHealth(): { pricesDb: PricesDbState | 'not_checked'; pricesDbFaults: Partial<Record<PricesDbState, number>> } {
  return { pricesDb: path === null ? 'not_checked' : inspectPricesDb(path).state, pricesDbFaults: { ...faults } };
}
