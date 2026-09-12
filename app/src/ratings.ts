/**
 * Was that answer any good. Plan item 8.
 *
 * The cheapest honest signal this product can collect, and the only one that
 * comes from the person rather than from us. The scan log already records what
 * we THOUGHT happened: identified, refused, corrected. None of those three is
 * the same question as whether the answer helped. A scan can be identified,
 * priced, confident, and wrong about the thing on the shelf, and today the
 * only way that ever reaches us is if somebody bothers to type a correction.
 *
 * ONE RATING PER SCAN, enforced by the schema rather than by this file: the
 * table's primary key is the scan id (see `migrations.ts`, version 3), so "a
 * second tap overwrites" is not a rule the route has to remember. The write
 * below is an upsert for that reason and for no other.
 *
 * THE FOUR REASONS ARE A CLOSED LIST, and they are the four a tester can
 * actually distinguish while standing in an aisle: wrong product, wrong price,
 * no price, too slow. Each one points at a different part of the system (the
 * catalogue match, the price evidence, the price coverage, the model call), so
 * a week of thumbs-down reasons is a ranked list of what to fix. An open text
 * box would be richer and would also be a free-text field full of personal
 * detail that the privacy screen would then have to describe.
 *
 * A REASON IS ONLY FOR A THUMBS-DOWN, and a reason arriving with a thumbs-up
 * is dropped rather than refused. It is a client bug, not a person's mistake,
 * and refusing the rating over it would lose the one signal we were given.
 *
 * DELETE IS AN UNDO, not a withdrawal of consent, and it is why the route for
 * it exists at all: the thumbs sit under a verdict on a phone, a thumb lands
 * on the wrong one, and four seconds of "undo" is the difference between that
 * costing nothing and costing us a false signal we can never tell from a true
 * one.
 */

import { activeScanStore, getScan, openScanStore } from './scans.ts';

export type Rating = 'up' | 'down';

/**
 * The closed list. Exported because the route validates against it and the
 * client lane's four chips are the same four words; a fifth chip on a screen
 * with no entry here would be silently dropped, so the list is the contract.
 */
export const RATING_REASONS = ['wrong_product', 'wrong_price', 'no_price', 'too_slow'] as const;
export type RatingReason = (typeof RATING_REASONS)[number];

export function isRating(value: unknown): value is Rating {
  return value === 'up' || value === 'down';
}

export function isRatingReason(value: unknown): value is RatingReason {
  return typeof value === 'string' && (RATING_REASONS as readonly string[]).includes(value);
}

export interface RatingInput {
  readonly scanId: number;
  readonly deviceId: string;
  readonly rating: Rating;
  readonly reason?: RatingReason | null;
}

/**
 * Is this a scan id that names a real row.
 *
 * The route refuses a rating without one, and this is what "without one"
 * means: not merely a number, but a number that is a scan. A rating filed
 * against an id that names nothing is a row that can never be joined to
 * anything, which is worse than no rating at all because it inflates the
 * count of people who told us something.
 *
 * NOT AN OWNERSHIP CHECK, deliberately. It does not ask whether the scan
 * belongs to the device doing the rating. A device id is a random string the
 * phone generates and sends; it is not a credential and treating it as one
 * would be security theatre that only ever inconveniences the honest case (a
 * reinstall, a second device, the unattributed bucket). Who rated is recorded
 * on the rating row, which is the honest version of the same fact.
 */
export function scanExists(scanId: number): boolean {
  if (!Number.isInteger(scanId) || scanId <= 0) return false;
  return getScan(scanId) !== null;
}

/**
 * Stores one rating, replacing this scan's earlier one.
 *
 * Never throws. Returns whether the row landed; the route answers on it rather
 * than claiming `stored: true` over a drop, because a thumbs-up that silently
 * vanished is the kind of thing a beta tester repeats three times before
 * mentioning it.
 */
export function rateScan(input: RatingInput, now: Date = new Date()): boolean {
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    // A reason belongs to a thumbs-down. See the header: dropped, not refused.
    const reason = input.rating === 'down' ? (input.reason ?? null) : null;
    store.db
      .prepare(
        `INSERT INTO scan_rating (scan_id, device_id, rating, reason, rated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(scan_id) DO UPDATE SET device_id = excluded.device_id, rating = excluded.rating, reason = excluded.reason, rated_at = excluded.rated_at`,
      )
      .run(input.scanId, input.deviceId, input.rating, reason, now.toISOString());
    return true;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * Removes a rating. The undo behind the four-second window on the phone.
 *
 * Returns true when a row went away and ALSO true when there was nothing to
 * remove, because the client's question is "is it gone" and both answers to
 * that are yes. Anything else makes a double-tapped undo look like a failure
 * to a queue that will then retry it.
 */
export function deleteRating(scanId: number): boolean {
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    store.db.prepare('DELETE FROM scan_rating WHERE scan_id = ?').run(scanId);
    return true;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

export interface RatingRow {
  scan_id: number;
  device_id: string;
  rating: string;
  reason: string | null;
  rated_at: string;
}

/** One scan's rating, or null. Test and route helper. */
export function ratingFor(scanId: number): RatingRow | null {
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const row = store.db
      .prepare('SELECT * FROM scan_rating WHERE scan_id = ?')
      .get(scanId) as unknown as RatingRow | undefined;
    return row ?? null;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return null;
  }
}

export interface RatingCounts {
  readonly up: number;
  readonly down: number;
  /** Every reason given for a thumbs-down, counted. Absent reasons are not counted. */
  readonly reasons: Record<string, number>;
}

/**
 * How this device rated its own scans, for the profile screen (plan item 8d).
 *
 * Per device, not across everybody, because the screen it feeds is the one
 * that says what YOU have done. Zeroes are honest here, unlike the rates in
 * `scan-summary.ts`: a device that has rated nothing has rated nothing, and
 * that is a count rather than an empty denominator.
 */
export function ratingCounts(deviceId?: string): RatingCounts {
  const store = activeScanStore() ?? openScanStore();
  const reasons: Record<string, number> = {};
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const where = deviceId ? ' WHERE device_id = ?' : '';
    const args = deviceId ? [deviceId] : [];
    const rows = store.db
      .prepare(`SELECT rating, reason, COUNT(*) AS n FROM scan_rating${where} GROUP BY rating, reason`)
      .all(...args) as unknown as { rating: string; reason: string | null; n: number }[];
    let up = 0;
    let down = 0;
    for (const row of rows) {
      const n = Number(row.n);
      if (row.rating === 'up') up += n;
      if (row.rating === 'down') {
        down += n;
        if (row.reason) reasons[row.reason] = (reasons[row.reason] ?? 0) + n;
      }
    }
    return { up, down, reasons };
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return { up: 0, down: 0, reasons };
  }
}
