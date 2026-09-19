/**
 * Two marks a scan row carries beyond what `recordScan` writes at insert time.
 * Audit rows 20, 16 and 32 (2026-09-19). Columns come from migration 13.
 *
 * WHY A SEPARATE WRITE. The scan row is inserted before anything about the
 * verdict or the spend is worth a second look, and a price call after a server
 * restart re-runs the scan against a row that already exists. So this is a small
 * UPDATE by scan id that either path can make. Like every write on the scan log
 * it never throws: a failed mark must not become a failed scan.
 *
 *   verdict_zone            the zone Gemini returned for the typed shelf price
 *                           against the user's own lines ('under_your_line',
 *                           'middle', 'over_your_line'), or NULL when there was no
 *                           shelf price or Gemini gave no placement. Never Shin's
 *                           own arithmetic (his rule: Gemini does the math).
 *   verdict_thresholds_json the thresholds that went into that prompt.
 *   over_cap                1 when the scan was made past the daily soft spend cap.
 */

import { activeScanStore, openScanStore } from './scans.ts';

export interface ScanMarks {
  /** The zone Gemini returned, verbatim, or null. */
  readonly verdictZone: string | null;
  /** The thresholds used, already stringified; null when none were used. */
  readonly verdictThresholdsJson: string | null;
  readonly overCap: boolean;
}

/** Writes the marks onto one scan row. Returns whether a row changed. Never throws. */
export function markScan(scanId: number | null, marks: ScanMarks): boolean {
  if (scanId === null) return false;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const result = store.db
      .prepare('UPDATE scan SET verdict_zone = ?, verdict_thresholds_json = ?, over_cap = ? WHERE id = ?')
      .run(marks.verdictZone, marks.verdictThresholdsJson, marks.overCap ? 1 : 0, scanId);
    return Number(result.changes) > 0;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}
