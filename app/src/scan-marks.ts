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

import { activeScanStore, openScanStore, planShownWrite, recordLaterAnswer, reportScanFault } from './scans.ts';

export interface ScanMarks {
  /** The zone Gemini returned, verbatim, or null. */
  readonly verdictZone: string | null;
  /** The thresholds used, already stringified; null when none were used. */
  readonly verdictThresholdsJson: string | null;
  readonly overCap: boolean;
}

/**
 * Writes the marks onto one scan row. Returns whether a row changed (or a later
 * answer was stored beside it). Never throws.
 *
 * REQUIREMENT 3.9. `verdict_zone` and `verdict_thresholds_json` are the answer
 * the shopper was shown. A price call that re-runs the scan on a row that
 * already showed a zone used to write the new zone over it; now a different
 * zone goes to `scan_later_answer` and the row keeps what was shown. `over_cap`
 * is a fact about spend, not the answer, and is always written.
 */
export function markScan(scanId: number | null, marks: ScanMarks, via = 'mark_scan'): boolean {
  if (scanId === null) return false;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const shown = { verdict_zone: marks.verdictZone, verdict_thresholds_json: marks.verdictThresholdsJson };
    const plan = planShownWrite(store.db, scanId, shown);
    if (!plan.exists) return false;
    const beside = plan.differs ? recordLaterAnswer(scanId, plan.deviceId, via, shown) : false;
    const sets: Record<string, string | number | null> = { ...plan.fill, over_cap: marks.overCap ? 1 : 0 };
    const cols = Object.keys(sets);
    const result = store.db
      .prepare(`UPDATE scan SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...cols.map((c) => sets[c] ?? null), scanId);
    return Number(result.changes) > 0 || beside;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    reportScanFault('markScan', scanId, err);
    return false;
  }
}
