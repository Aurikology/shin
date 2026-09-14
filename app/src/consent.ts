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
 * TWO SEPARATE ANSWERS, never one. A person who withdraws the photograph of a
 * shelf has not thereby withdrawn where the shelf is, and the reverse is more
 * obviously true. They are two columns and two questions on the screen.
 *
 * BOTH DEFAULT ON, AND THE DEFAULT IS NO ROW. Changed 2026-09-14 on his word,
 * "build everything for collecting EVERYTHING": a device that has never
 * answered reads exactly the same as a device that answered yes: photos true,
 * location true, updatedAt null. The `updatedAt` is what separates them for
 * anybody who needs to know, and nothing in the server does. Turning a toggle
 * OFF is what writes a row now; leaving both alone writes nothing and keeps
 * everything, which is the opt-out this file enforces.
 *
 * WHAT THIS MEANS FOR THE PRODUCT, said plainly because the privacy notice has
 * to say it and it must be true: the scan row, the photograph and the coarse
 * and exact location are all kept by default, all of it to train Shin's
 * models and to answer other shoppers pointed at the same thing (the vision
 * doc's own sentence). The two toggles are the only way to hold either of the
 * last two back; the scan row itself is never optional, consent or not.
 *
 * NO HISTORY TABLE. Only the current answer is stored. A log of when somebody
 * said no is still something kept about a person who said keep nothing, and
 * the event log already records a consent change as an event for anybody
 * asking about the sequence.
 *
 * Lives in the scan database rather than one of its own for the same reason
 * the ratings and the events do: it is read on the same requests that write
 * scans, one file is one backup, and a consent flag in a second file that
 * failed to open would fail OPEN -- and open now means kept, which is the
 * direction that matters while the beta is family-only and the founder's own
 * word governs what a missing answer means.
 */

import { activeScanStore, openScanStore } from './scans.ts';

export interface Consent {
  readonly photos: boolean;
  readonly location: boolean;
  /** ISO timestamp of the last answer, or null when there has never been one. */
  readonly updatedAt: string | null;
}

/**
 * Everything agreed to. Both the default for a device with no row and the
 * answer on any failure to read one, per the header above: a read that fails
 * must fail the same way an unanswered device reads, and an unanswered device
 * is kept by default now.
 */
const EVERYTHING: Consent = { photos: true, location: true, updatedAt: null };

interface ConsentRow {
  photos: number;
  location: number;
  updated_at: string;
}

/**
 * What this device has agreed to.
 *
 * NEVER THROWS, AND FAILS TOWARD KEEPING. A database that will not open, a row
 * that will not read, a device id that is empty: every one of them answers
 * "everything agreed to", which is what an unanswered device already reads as
 * per the header above. This matches how the rest of this package treats a
 * failed read (a scan store that will not open still answers the person in
 * front of it) rather than opposing it the way the old off-by-default version
 * did: there is no longer a direction where failing is the safer guess, so the
 * read fails the same way silence does.
 */
export function readConsent(deviceId: string): Consent {
  const id = deviceId?.trim();
  if (!id) return EVERYTHING;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const row = store.db
      .prepare('SELECT photos, location, updated_at FROM consent WHERE device_id = ?')
      .get(id) as unknown as ConsentRow | undefined;
    if (!row) return EVERYTHING;
    return { photos: row.photos === 1, location: row.location === 1, updatedAt: row.updated_at };
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return EVERYTHING;
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
