/**
 * Faults on the customer-data path (requirements 3.9, 5.1, 5.6, 5.9 in
 * docs/price-category-requirements-2026-10-01.md), counted and logged loudly.
 *
 * RULINGS.md "Errors never go unnoticed": every fault is seen, never absorbed,
 * and a shopper's answer is still given ("Always answer"). So nothing here
 * throws or blocks. Each fault is one line `[customer-data-fault] <kind>
 * <detail>` and a count by kind that `/api/health` shows beside the
 * `[category-fault]` and `[catalogue-fault]` counts, the same shape as
 * catalogue-first.ts's `catalogueFaults`.
 *
 * The kinds:
 *   exact_position_dropped     an exact position reached a writer and was
 *                              dropped or snapped before storage (5.6).
 *   shown_answer_edit_refused  the database refused an edit of a shown answer
 *                              (3.9). The code paths write beside the shown
 *                              answer, so this firing means a path was missed.
 *   later_answer_not_stored    a later answer could not be stored beside the
 *                              shown one (3.9).
 *   scan_write_failed          a scan-log write on a customer-data path failed.
 *
 * The detail never carries coordinates, a photo or a request body (errlog.ts's
 * rule): kinds, ids and column names only.
 */

const counts: Record<string, number> = {};

export type CustomerDataFaultKind =
  | 'exact_position_dropped'
  | 'shown_answer_edit_refused'
  | 'later_answer_not_stored'
  | 'scan_write_failed';

export function customerDataFault(kind: CustomerDataFaultKind, detail: string): void {
  counts[kind] = (counts[kind] ?? 0) + 1;
  console.warn(`[customer-data-fault] ${kind} ${detail}`);
}

/** Faults since start, by kind. Empty means none. */
export function customerDataFaults(): Record<string, number> {
  return { ...counts };
}

/** TEST ONLY: forget the counts. */
export function resetCustomerDataFaultsForTests(): void {
  for (const k of Object.keys(counts)) delete counts[k];
}
