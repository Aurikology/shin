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
 * BOTH DEFAULT OFF, AND THE DEFAULT IS NO ROW. From 2026-09-19 to D-148
 * (2026-09-22) photos defaulted ON here, on a reading of Jamin's "save as
 * much data as possible" (beta gap item 13). That was the wrong side of the
 * standing ruling "Location and photo consent default off until answered",
 * and it meant a fresh install streamed shelf crops before anybody had been
 * asked. A device that has never answered now reads photos false, location
 * false, updatedAt null; only a written yes turns either on.
 *
 * THE RULING, 2026-09-14, because the two founders said opposite things on
 * the same day and this file is where the answer has to live. Jamin: "build
 * everything for collecting NOTHING", and for one push this read on by
 * default with the exact GPS position beside the cell. Aurik, asked which
 * stands for the beta, chose the design he approved on 2026-09-13: off until
 * answered, the coarse cell only, no exact position stored. The privacy notice
 * on the consent screen says "off unless you turn them on" and "never your
 * exact spot", and with this file it is true. Migration 8's exact columns stay
 * in the schema and stay empty; `server.ts`'s `locationFor` writes null into
 * them whatever the client sends. What IS kept when a toggle is on is still
 * used to train Shin and to answer other shoppers, and the footer says so.
 *
 * REVERSED 2026-11-25 ON JAMIN'S WORD: "Everything that is not part of the functionality of the app will
 * come in one long document at the beginning of the app ... The user will then not have the option to
 * turn off send data to Claude or other things like that." The app's switches are gone; pressing Accept
 * and continue on the Terms, Privacy and Data document posts `accepted: true`, which the route writes as
 * photos yes, location yes. What stays: a device with no row (never accepted) still keeps nothing, a
 * failed read still keeps nothing, location is still only the coarse cell the phone's own OS permission
 * lets it send, and `locationFor` still writes null into the exact columns.
 *
 * NO HISTORY TABLE. Only the current answer is stored. A log of when somebody
 * said no is still something kept about a person who said keep nothing, and
 * the event log already records a consent change as an event for anybody
 * asking about the sequence.
 *
 * Lives in the scan database rather than one of its own for the same reason
 * the ratings and the events do: it is read on the same requests that write
 * scans, one file is one backup, and a consent flag in a second file that
 * failed to open would fail OPEN.
 */

import { activeScanStore, openScanStore } from './scans.ts';

export interface Consent {
  readonly photos: boolean;
  readonly location: boolean;
  /** ISO timestamp of the last answer, or null when there has never been one. */
  readonly updatedAt: string | null;
  /**
   * "Help improve Pexi" (2026-11-26, legal review A G1/G2): usage recording beyond what answering a scan needs,
   * and use of it to improve Pexi. Optional, off until the shopper says yes, withdrawable any time.
   */
  readonly improve: boolean;
  /** When `improve` was last set, or null when it never was. */
  readonly improveAt: string | null;
  /**
   * Whether a typed search may go to Anthropic's Claude (Apple 5.1.2(i), legal review A G3): true is the yes on
   * the one-time notice, false is "not now" (Pexi's own data answers), null is "never asked", which the server
   * treats as no and the phone treats as "show the notice".
   */
  readonly aiText: boolean | null;
  /** When `aiText` was last set, or null. */
  readonly aiTextAt: string | null;
}

/**
 * Nothing agreed to. The answer on any failure to read a row, and for a
 * device with no id: a read that fails could be hiding a written no, so it
 * fails toward keeping less, the direction that can never break an opt-out.
 */
const NOTHING: Consent = { photos: false, location: false, updatedAt: null, improve: false, improveAt: null, aiText: null, aiTextAt: null };

/**
 * What a device with no row reads as: nothing agreed to. See the
 * header. Exported so the tests and the client mirror name one value.
 */
export const DEFAULT_CONSENT: Consent = { photos: false, location: false, updatedAt: null, improve: false, improveAt: null, aiText: null, aiTextAt: null };

interface ConsentRow {
  photos: number;
  location: number;
  updated_at: string;
  improve: number | null;
  improve_at: string | null;
  ai_text: number | null;
  ai_text_at: string | null;
}

/**
 * What this device has agreed to.
 *
 * NEVER THROWS. A device with no row reads `DEFAULT_CONSENT`. A database that
 * will not open, a row that will not read, or a device id that is empty reads
 * `NOTHING` instead: an unreadable row could be a written opt-out, and keeping
 * a photograph somebody told us not to keep is the one error here that cannot
 * be undone, while a photograph not kept is one scan's evidence lost.
 */
export function readConsent(deviceId: string): Consent {
  const id = deviceId?.trim();
  if (!id) return NOTHING;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const row = store.db
      .prepare('SELECT photos, location, updated_at, improve, improve_at, ai_text, ai_text_at FROM consent WHERE device_id = ?')
      .get(id) as unknown as ConsentRow | undefined;
    if (!row) return DEFAULT_CONSENT;
    return {
      photos: row.photos === 1,
      location: row.location === 1,
      updatedAt: row.updated_at,
      improve: row.improve === 1,
      improveAt: row.improve_at ?? null,
      aiText: row.ai_text === null || row.ai_text === undefined ? null : row.ai_text === 1,
      aiTextAt: row.ai_text_at ?? null,
    };
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

/**
 * Records the two optional choices (2026-11-26): "Help improve Pexi" and "a typed search may go to Claude".
 * A field left out is left as it was, so changing one never changes the other, and never touches the
 * photos and location answers above. Each one that is given is stored with the time it was given, which is
 * the record a withdrawal needs. A device with no row gets one reading photos off and location off, the
 * same as having no row. Returns whether it was written; false must reach the phone, because a shopper who
 * just withdrew has to know whether the refusal is in force.
 */
export function writeChoices(
  deviceId: string,
  choices: { improve?: boolean; aiText?: boolean },
  now: Date = new Date(),
): boolean {
  const id = deviceId?.trim();
  if (!id) return false;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const at = now.toISOString();
    store.db
      .prepare('INSERT OR IGNORE INTO consent (device_id, photos, location, updated_at) VALUES (?, 0, 0, ?)')
      .run(id, at);
    if (typeof choices.improve === 'boolean') {
      store.db.prepare('UPDATE consent SET improve = ?, improve_at = ? WHERE device_id = ?').run(choices.improve ? 1 : 0, at, id);
    }
    if (typeof choices.aiText === 'boolean') {
      store.db.prepare('UPDATE consent SET ai_text = ?, ai_text_at = ? WHERE device_id = ?').run(choices.aiText ? 1 : 0, at, id);
    }
    return true;
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return false;
  }
}

/**
 * May usage be recorded for this device beyond what answering needs (the event table)? Only a stored yes.
 * A device with no row, a failed read, or a withdrawn choice is a no.
 */
export function keepUsage(deviceId: string): boolean {
  return readConsent(deviceId).improve;
}

/** May this device's typed search go to Anthropic's Claude? Only a stored yes; never asked reads as no. */
export function mayAskClaudeWithText(deviceId: string): boolean {
  return readConsent(deviceId).aiText === true;
}

/**
 * Event types that are the record of a choice itself. They are kept even when usage recording is off,
 * because a withdrawal that left no trace could not be shown to have been honoured.
 */
export const CHOICE_EVENT_TYPES: readonly string[] = ['agreement', 'consent_change', 'choice_change'];
