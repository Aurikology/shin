/**
 * What a device has agreed to let us keep, and the thing that refuses when it
 * has not.
 *
 * Plan item 6c. The consent SCREEN is the client lane's; this is the storage
 * and the refusal, and the refusal is the half that matters. A toggle that
 * writes a row and changes nothing about what the server keeps is the shape of
 * privacy theatre, so `keepPhoto` and `keepLocation` are exported here and the
 * routes ask them before a photo or a cell reaches the disk.
 *
 * TWO SEPARATE ANSWERS, never one. A person who will let us keep the
 * photograph of a shelf has not thereby agreed to let us keep where the shelf
 * is, and the reverse is more obviously true. They are two columns and two
 * questions on the screen.
 *
 * BOTH DEFAULT OFF, AND THE DEFAULT IS NO ROW. A device that has never
 * answered reads exactly the same as a device that answered no: photos false,
 * location false, updatedAt null. The `updatedAt` is what separates them for
 * anybody who needs to know, and nothing in the server does.
 *
 * WHAT IS STILL KEPT WHEN BOTH ARE OFF, said plainly because the privacy
 * screen has to say it and it must be true: the scan row itself. What was
 * asked, what came back, when, and the random device id. That is the product
 * (the free-tier meter, the crawler queue, the answer rate all read it) and it
 * is what the truthful data statement in plan item 6a describes. The two
 * toggles govern the photograph and the place, which are the two things a
 * person would reasonably not want kept and neither of which the product
 * needs.
 *
 * NO HISTORY TABLE. Only the current answer is stored. A log of when somebody
 * said no is still something kept about a person who said keep nothing, and
 * the event log already records a consent change as an event for anybody
 * asking about the sequence.
 *
 * Lives in the scan database rather than one of its own for the same reason
 * the ratings and the events do: it is read on the same requests that write
 * scans, one file is one backup, and a consent flag in a second file that
 * failed to open would fail OPEN, which is the one direction a consent check
 * must never fail.
 */

import { activeScanStore, openScanStore } from './scans.ts';

export interface Consent {
  readonly photos: boolean;
  readonly location: boolean;
  /** ISO timestamp of the last answer, or null when there has never been one. */
  readonly updatedAt: string | null;
}

/** Nothing agreed to, which is both the default and the answer on any failure. */
const NOTHING: Consent = { photos: false, location: false, updatedAt: null };

interface ConsentRow {
  photos: number;
  location: number;
  updated_at: string;
}

/**
 * What this device has agreed to.
 *
 * NEVER THROWS, AND FAILS CLOSED. A database that will not open, a row that
 * will not read, a device id that is empty: every one of them answers
 * "nothing agreed to". That is the opposite of how the rest of this package
 * treats a failed read (a scan store that will not open still answers the
 * person in front of it) and the difference is deliberate: the cost of
 * wrongly answering "no consent" is a photo not kept, and the cost of wrongly
 * answering "consent" is a photo kept that somebody asked us not to keep.
 */
export function readConsent(deviceId: string): Consent {
  const id = deviceId?.trim();
  if (!id) return NOTHING;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const row = store.db
      .prepare('SELECT photos, location, updated_at FROM consent WHERE device_id = ?')
      .get(id) as unknown as ConsentRow | undefined;
    if (!row) return NOTHING;
    return { photos: row.photos === 1, location: row.location === 1, updatedAt: row.updated_at };
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return NOTHING;
  }
}

/**
 * Records this device's two answers, replacing whatever it said before.
 *
 * Returns whether it was written. A false here is worth reporting to the
 * client, unlike most failures in this package: a person who has just turned
 * photo consent ON and been told nothing would go on believing their photos
 * are being kept for the beta when they are not, and a person who has just
 * turned it OFF has to know the refusal is in force. The route answers on this
 * return value rather than assuming.
 */
export function writeConsent(deviceId: string, photos: boolean, location: boolean, now: Date = new Date()): boolean {
  const id = deviceId?.trim();
  if (!id) return false;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    store.db
      .prepare(
        `INSERT INTO consent (device_id, photos, location, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET photos = excluded.photos, location = excluded.location, updated_at = excluded.updated_at`,
      )
      .run(id, photos ? 1 : 0, location ? 1 : 0, now.toISOString());
    return true;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/** May this device's photograph be written to disk and kept? */
export function keepPhoto(deviceId: string): boolean {
  return readConsent(deviceId).photos;
}

/** May this device's coarse cell and chosen store be written onto a scan row? */
export function keepLocation(deviceId: string): boolean {
  return readConsent(deviceId).location;
}
