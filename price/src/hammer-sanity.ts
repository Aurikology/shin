/**
 * PROJECT HAMMER IMPORT SANITY CHECKS (readiness item R28, 2026-11-18).
 *
 * The weekly refresh (mac/hammer-refresh.sh -> price/src/hammer.ts) used to accept any file that
 * parsed. A publisher unit change, a half-empty download or a retailer dropping out would have
 * loaded as the week's prices and shoppers would have seen wrong verdicts. Before anything is
 * written, `judgeImport` reads the numbers; when a check fails the import is REFUSED: nothing is
 * written, last week's prices stay, the script exits non-zero (the shell step fails loudly), and
 * the refusal is stored in the prices file (`recordRefusal`) where /api/health reads it
 * (app/src/watch.ts) so the outside alarm goes red too.
 *
 * The limits come from the readiness register (R28): rows down more than 30 percent against the
 * last accepted run, the newest price day over 14 days old, the median price moving more than 25
 * percent. Added: a retailer gone or halved, more than 2 percent of prices moving over ten times
 * (the signature of a cents/dollars change), and more than 1 percent of prices outside a
 * believable range.
 *
 * A refused run is never the baseline for the next one: `recordImport` is called only after an
 * accepted import, so a bad file cannot lower the bar for its successor.
 */
import type { DatabaseSync } from 'node:sqlite';

export const HAMMER_IMPORT_REFUSED_KEY = 'hammer_import_refused';
export const HAMMER_LAST_IMPORT_KEY = 'hammer_last_import';

export const LIMITS = {
  rowsDrop: 0.3,
  pricedDrop: 0.3,
  vendorDrop: 0.5,
  newestDayMaxAgeDays: 14,
  medianMove: 0.25,
  over10xShare: 0.02,
  badUnitShare: 0.01,
  /** Fewer compared products than this say nothing about a unit change. */
  minCompared: 200,
  /** A vendor with fewer priced products than this last time is too small to judge by share. */
  minVendor: 50,
  minCents: 5,
  maxCents: 300_000,
} as const;

export interface ImportStats {
  /** Price rows in the raw file. */
  readonly rows: number;
  /** Products that will get a price (barcoded path). */
  readonly priced: number;
  readonly byVendor: Readonly<Record<string, number>>;
  /** Newest price day in the file, YYYYMMDD. */
  readonly maxDay: string;
  readonly unitChecked: number;
  readonly unitBad: number;
  /** Products whose new price could be set against the stored one. */
  readonly compared: number;
  readonly over10x: number;
  /** Median of |new / stored - 1|, or null when nothing was compared. */
  readonly medianMove: number | null;
}

export interface PriorImport {
  readonly rows: number;
  readonly priced: number;
  readonly byVendor: Readonly<Record<string, number>>;
}

export function priceUnitIsSane(cents: number): boolean {
  return cents >= LIMITS.minCents && cents <= LIMITS.maxCents;
}

const pct = (x: number) => `${Math.round(x * 100)} percent`;

/** The verdict on one import. Pure. `nowMs` is the clock. */
export function judgeImport(s: ImportStats, prior: PriorImport | null, nowMs: number): { ok: boolean; failures: string[] } {
  const failures: string[] = [];

  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(s.maxDay);
  if (!day) failures.push(`the file has no readable newest price day (${s.maxDay})`);
  else {
    const newest = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    const today = Math.floor(nowMs / 86_400_000) * 86_400_000;
    const age = Math.round((today - newest) / 86_400_000);
    if (age > LIMITS.newestDayMaxAgeDays) failures.push(`the newest price day in the file is ${age} days old (limit ${LIMITS.newestDayMaxAgeDays})`);
  }

  if (s.unitChecked > 0 && s.unitBad / s.unitChecked > LIMITS.badUnitShare) {
    failures.push(`${s.unitBad} of ${s.unitChecked} prices (${pct(s.unitBad / s.unitChecked)}) are outside 5 cents to 3000 dollars, which looks like a unit change`);
  }

  if (s.compared >= LIMITS.minCompared) {
    if (s.over10x / s.compared > LIMITS.over10xShare) {
      failures.push(`${s.over10x} of ${s.compared} prices (${pct(s.over10x / s.compared)}) moved more than ten times against what is stored, which looks like a unit change`);
    }
    if (s.medianMove !== null && s.medianMove > LIMITS.medianMove) {
      failures.push(`the median price moved ${pct(s.medianMove)} against what is stored (limit ${pct(LIMITS.medianMove)})`);
    }
  }

  if (prior !== null) {
    if (prior.rows > 0 && s.rows < prior.rows * (1 - LIMITS.rowsDrop)) {
      failures.push(`price rows fell from ${prior.rows} to ${s.rows} (more than ${pct(LIMITS.rowsDrop)} down)`);
    }
    if (prior.priced > 0 && s.priced < prior.priced * (1 - LIMITS.pricedDrop)) {
      failures.push(`products priced fell from ${prior.priced} to ${s.priced} (more than ${pct(LIMITS.pricedDrop)} down)`);
    }
    for (const [vendor, before] of Object.entries(prior.byVendor)) {
      if (before < LIMITS.minVendor) continue;
      const now = s.byVendor[vendor] ?? 0;
      if (now < before * (1 - LIMITS.vendorDrop)) failures.push(`${vendor} products priced fell from ${before} to ${now}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

/** Median of a list (average of the middle two when even). */
function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 === 1 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

/**
 * Each new price set against the Hammer price already stored for the same seller sku (the sale
 * rows' regular price is stored under `<sku>#regular` and is not compared). Read-only.
 */
export function compareToStored(
  db: DatabaseSync,
  items: readonly { sku: string; cents: number }[],
): { compared: number; over10x: number; medianMove: number | null } {
  const stored = new Map<string, number>();
  const rows = db.prepare("SELECT seller_sku, price_cents FROM observation WHERE seller = 'hammer' AND seller_sku NOT LIKE '%#regular'").all() as unknown as {
    seller_sku: string;
    price_cents: number;
  }[];
  for (const r of rows) stored.set(r.seller_sku, Number(r.price_cents));
  const moves: number[] = [];
  let over10x = 0;
  for (const { sku, cents } of items) {
    const old = stored.get(sku);
    if (old === undefined || old <= 0) continue;
    const ratio = cents / old;
    moves.push(Math.abs(ratio - 1));
    if (ratio >= 10 || ratio <= 0.1) over10x += 1;
  }
  return { compared: moves.length, over10x, medianMove: moves.length === 0 ? null : median(moves) };
}

/** What the last ACCEPTED import looked like, or null when there has been none (or the note cannot be read). */
export function readPriorImport(db: DatabaseSync): PriorImport | null {
  try {
    const row = db.prepare('SELECT value FROM store_meta WHERE key = ?').get(HAMMER_LAST_IMPORT_KEY) as { value: string } | undefined;
    if (!row) return null;
    const p = JSON.parse(row.value) as Partial<PriorImport>;
    if (typeof p.rows !== 'number' || typeof p.priced !== 'number' || typeof p.byVendor !== 'object' || p.byVendor === null) return null;
    return { rows: p.rows, priced: p.priced, byVendor: p.byVendor };
  } catch {
    return null;
  }
}

/** The refusal /api/health reports, or null when the last import was accepted. */
export function readRefusal(db: DatabaseSync): { at: string; why: string } | null {
  try {
    const row = db.prepare('SELECT value FROM store_meta WHERE key = ?').get(HAMMER_IMPORT_REFUSED_KEY) as { value: string } | undefined;
    if (!row) return null;
    const p = JSON.parse(row.value) as { at?: unknown; why?: unknown };
    return typeof p.at === 'string' ? { at: p.at, why: typeof p.why === 'string' ? p.why : '' } : null;
  } catch {
    return null;
  }
}

/** An import was refused: say so where the health route reads it. The prices themselves are untouched. */
export function recordRefusal(db: DatabaseSync, why: string, at: string = new Date().toISOString()): void {
  db.prepare('INSERT OR REPLACE INTO store_meta (key, value) VALUES (?, ?)').run(HAMMER_IMPORT_REFUSED_KEY, JSON.stringify({ at, why }));
}

/** An import was accepted: it becomes the baseline for the next one and any earlier refusal is cleared. */
export function recordImport(db: DatabaseSync, s: ImportStats, at: string = new Date().toISOString()): void {
  const note: PriorImport & { at: string } = { rows: s.rows, priced: s.priced, byVendor: s.byVendor, at };
  db.prepare('INSERT OR REPLACE INTO store_meta (key, value) VALUES (?, ?)').run(HAMMER_LAST_IMPORT_KEY, JSON.stringify(note));
  db.prepare('DELETE FROM store_meta WHERE key = ?').run(HAMMER_IMPORT_REFUSED_KEY);
}
