/**
 * Reading the scan log back as the figures the vision asks for.
 *
 * `docs/the-vision.md` names four things under Want and Reliance and says of
 * three of them "Nothing measures this today", with one line naming the cause:
 * "the scan record exists and has no reader". This is that reader. It is the
 * other half of `scans.ts`, which is the writer, and the two were built months
 * apart in the same hour and never introduced.
 *
 * WHAT THIS COUNTS, AND WHAT IT DOES NOT. `scan` is an identity log: one row
 * per "what is this thing" asked by a person, with the outcome of naming it.
 * So the answer rate here is the share of scans the catalogue could NAME, not
 * the share that ended with a price. Those are two different numbers and the
 * second one is much smaller (three products, measured 2026-09-05). Calling
 * this one "the answer rate" without the word identity in front of it would
 * flatter the product by an order of magnitude, so nothing here does.
 *
 * WHY A ZERO DENOMINATOR IS NOT A ZERO. A rate over no scans is not 0%, it is
 * unknown, and the difference is the whole of this repo's first priority. Every
 * figure below is `null` when its denominator is empty and the caller has to
 * decide what to print; nothing here rounds an empty week down to a number that
 * looks like a measurement.
 *
 * UNATTRIBUTED ROWS. A scan that arrived with no device id is written down with
 * the device id `unattributed`, because dropping it would make the answer rate
 * a statement about a sample nobody chose. It counts in everything about scans
 * and in nothing about people: a return rate computed over one bucket holding
 * every anonymous request would read as one very loyal user.
 */

import type { ScanStore } from './scans.ts';
import { activeScanStore, openScanStore } from './scans.ts';
import { ratingCounts, type RatingCounts } from './ratings.ts';

/** The device id given to a scan that arrived without one. Never a person. */
export const UNATTRIBUTED = 'unattributed';

export interface RatePerKind {
  readonly kind: string;
  readonly scans: number;
  readonly named: number;
  /** null when `scans` is 0. A rate over nothing is unknown, not zero. */
  readonly rate: number | null;
}

export interface ScanSummary {
  readonly scans: number;
  readonly firstScan: string | null;
  readonly lastScan: string | null;
  /** Devices seen, excluding the unattributed bucket. */
  readonly devices: number;
  readonly unattributedScans: number;
  /** Identity answer rate, split by how the person asked. */
  readonly perKind: readonly RatePerKind[];
  /** Overall identity answer rate; null when nothing has been scanned. */
  readonly namedRate: number | null;
  /** Corrections per hundred named scans; null when nothing was named. */
  readonly correctionsPerHundred: number | null;
  readonly corrections: number;
  /**
   * The share of devices old enough to have had a second week that scanned in
   * it. Null when no device is old enough yet, which is the honest state for a
   * product nobody outside this machine has opened.
   */
  readonly secondWeekReturn: { eligible: number; returned: number; rate: number | null };
  /** Scans this device made since UTC Monday, when a device was asked about. */
  readonly thisDevice: { deviceId: string; scansThisWeek: number; named: number } | null;
  /**
   * Thumbs, and the reasons behind the thumbs-down ones. Plan item 8d.
   *
   * Scoped to the device when one was asked about, and across everything
   * otherwise, the same way `thisDevice` is. These are counts rather than
   * rates and so zero is a real answer here, unlike every rate above it.
   */
  readonly rated: RatingCounts;
  /** Writes or reads the log itself could not complete. Never hidden. */
  readonly dropped: number;
  readonly droppedWhy: string;
}

interface Row {
  device_id: string;
  kind: string;
  outcome: string;
  scanned_at: string;
}

const DAY = 86_400_000;

/**
 * Reads the whole log and derives every figure in one pass.
 *
 * One pass and no SQL beyond the select: the log is one row per scan by one
 * person, so it is small for as long as this product has one user, and the day
 * it is not is the day it deserves a real query rather than a clever one now.
 * `deviceId` asks for this device's own line as well, which is what a screen
 * shows a person about themselves.
 */
export function summariseScans(deviceId?: string, now: Date = new Date(), store?: ScanStore): ScanSummary {
  const s = store ?? activeScanStore() ?? openScanStore();
  const empty: ScanSummary = {
    scans: 0,
    firstScan: null,
    lastScan: null,
    devices: 0,
    unattributedScans: 0,
    perKind: [],
    namedRate: null,
    correctionsPerHundred: null,
    corrections: 0,
    secondWeekReturn: { eligible: 0, returned: 0, rate: null },
    thisDevice: deviceId ? { deviceId, scansThisWeek: 0, named: 0 } : null,
    rated: ratingCounts(deviceId),
    dropped: s.dropped,
    droppedWhy: s.droppedWhy,
  };

  let rows: Row[];
  try {
    if (!s.db) throw new Error(s.droppedWhy || 'scan store is not open');
    rows = s.db.prepare('SELECT device_id, kind, outcome, scanned_at FROM scan ORDER BY scanned_at ASC')
      .all() as unknown as Row[];
  } catch (err) {
    // The same contract the writer keeps: a log that cannot be read is counted,
    // never thrown at a screen that is trying to show somebody their own week.
    s.dropped += 1;
    s.droppedWhy = err instanceof Error ? err.message : String(err);
    return { ...empty, dropped: s.dropped, droppedWhy: s.droppedWhy };
  }
  if (rows.length === 0) return empty;

  const byKind = new Map<string, { scans: number; named: number }>();
  const firstSeen = new Map<string, number>();
  const times = new Map<string, number[]>();
  let named = 0;
  let corrections = 0;
  let unattributed = 0;

  for (const r of rows) {
    const k = byKind.get(r.kind) ?? { scans: 0, named: 0 };
    k.scans += 1;
    if (r.outcome === 'answered') k.named += 1;
    byKind.set(r.kind, k);

    if (r.outcome === 'answered') named += 1;
    if (r.outcome === 'corrected') corrections += 1;

    if (r.device_id === UNATTRIBUTED) {
      unattributed += 1;
      continue;
    }
    const t = Date.parse(r.scanned_at);
    if (Number.isNaN(t)) continue;
    if (!firstSeen.has(r.device_id) || t < firstSeen.get(r.device_id)!) firstSeen.set(r.device_id, t);
    const list = times.get(r.device_id) ?? [];
    list.push(t);
    times.set(r.device_id, list);
  }

  // Second week means days 7 through 13 after this device's first scan. A device
  // whose first scan was four days ago has not had a second week yet and is not
  // in the denominator; counting it as "did not return" would report a product
  // nobody has had time to abandon as one everybody abandoned.
  let eligible = 0;
  let returned = 0;
  for (const [device, first] of firstSeen) {
    if (now.getTime() - first < 14 * DAY) continue;
    eligible += 1;
    const list = times.get(device) ?? [];
    if (list.some((t) => t - first >= 7 * DAY && t - first < 14 * DAY)) returned += 1;
  }

  const weekStart = weekStartUtc(now);
  let thisDevice: ScanSummary['thisDevice'] = null;
  if (deviceId) {
    const list = rows.filter((r) => r.device_id === deviceId && r.scanned_at >= weekStart);
    thisDevice = {
      deviceId,
      scansThisWeek: list.length,
      named: list.filter((r) => r.outcome === 'answered').length,
    };
  }

  return {
    scans: rows.length,
    firstScan: rows[0].scanned_at,
    lastScan: rows[rows.length - 1].scanned_at,
    devices: firstSeen.size,
    unattributedScans: unattributed,
    perKind: [...byKind.entries()]
      .map(([kind, v]) => ({ kind, scans: v.scans, named: v.named, rate: v.scans ? v.named / v.scans : null }))
      .sort((a, b) => b.scans - a.scans),
    namedRate: rows.length ? named / rows.length : null,
    corrections,
    correctionsPerHundred: named ? (corrections / named) * 100 : null,
    secondWeekReturn: { eligible, returned, rate: eligible ? returned / eligible : null },
    thisDevice,
    /*
     * How this device rated its own answers. Plan item 8d, the server half.
     *
     * Per device when one was named, across everything otherwise, matching the
     * rest of this reply: the profile screen asks about the person looking at
     * it, and every other per-device figure here is already scoped that way.
     *
     * Zeroes are honest here, unlike the rates above. A rate with no
     * denominator is unknown and is reported as null; a device that has rated
     * nothing has rated nothing, and that is a count.
     */
    rated: ratingCounts(deviceId),
    dropped: s.dropped,
    droppedWhy: s.droppedWhy,
  };
}

/** UTC Monday 00:00 on or before `now`, ISO, to compare against `scanned_at`. */
function weekStartUtc(now: Date): string {
  const day = now.getUTCDay();
  const since = (day + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - since, 0, 0, 0, 0))
    .toISOString();
}
