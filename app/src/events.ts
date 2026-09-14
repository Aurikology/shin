/**
 * What happened, in order. Plan item 10.
 *
 * The scan log answers "what did we tell people". This answers "what did
 * people do", which is the question every other number in the beta turns out
 * to depend on. Six testers is far too small a sample for a rate; it is
 * exactly the right size for a sequence, and a sequence is the thing nobody
 * can reconstruct afterwards from a scan table.
 *
 * ONE TABLE FOR BOTH SIDES. Client events (app opened, scan started, answer
 * shown, thumbs, correction, share, consent change) and server events (a model
 * call was made, which source answered, why something was refused) go in the
 * same table with the same shape. The question a beta actually asks is "what
 * happened, in order", and two tables would mean interleaving them by hand
 * every single time. The type string says which side it came from.
 *
 * THE PAYLOAD IS JSON TEXT AND NOTHING QUERIES INSIDE IT. This is the one
 * place in this database where a blob of JSON is the right answer rather than
 * the lazy one: the table has to accept an event type nobody has thought of
 * yet without a migration, the export dumps the payload whole, and a column
 * per event type would be a schema change per screen. The moment something
 * wants to GROUP BY a field in there, that field becomes a column and this
 * comment is wrong.
 *
 * WHAT MAY GO IN A PAYLOAD, changed 2026-09-14 on the founder's word ("build
 * everything for collecting EVERYTHING"): coordinates and free text a person
 * typed are no longer refused here. Until today this list forbade both,
 * because the client had no legitimate way to send either one; that is no
 * longer true. `track.js` records the exact position alongside typed search
 * text, including text typed and then abandoned, because both are input this
 * product now trains its models and answers other shoppers from, the same
 * reason `consent.ts` defaults both toggles on. The one thing still refused is
 * a photo's own bytes: those belong in the photos folder behind the photo
 * consent flag (`photos.ts`) or nowhere, never as base64 in this table, so
 * that deleting a photo on the retention sweep (when one is configured) or on
 * request actually removes it rather than leaving a copy sitting in an event
 * payload nothing sweeps.
 *
 * NEVER THROWS, the same contract `scans.ts` keeps and for the same reason: a
 * camera loop that cannot write down what it just did must still answer the
 * person in front of it. An event that could not be stored is a counted drop
 * on the shared store handle.
 */

import { activeScanStore, openScanStore } from './scans.ts';

export interface EventInput {
  readonly deviceId: string;
  readonly type: string;
  /** Anything JSON-serialisable, or nothing. Serialised here, not by the caller. */
  readonly payload?: unknown;
  /** Overrides the recorded time. Tests place rows in a date range with it. */
  readonly createdAt?: string;
  /** Null until accounts exist. Plan item 12. */
  readonly userId?: string | null;
}

export interface EventRow {
  id: number;
  device_id: string;
  type: string;
  payload: string | null;
  created_at: string;
  user_id: string | null;
}

/**
 * How long an event type may be, and how big a payload may be once it is JSON.
 *
 * Both are refusals of shape rather than of content, and both exist because
 * this route takes an arbitrary object from a phone. 64 characters is longer
 * than any event name anybody would type and short enough that the type column
 * stays readable in a dump; 4 KiB is far more than any of the events named
 * above needs (the largest is a correction, about 450 bytes) and small enough
 * that a client bug looping on this route cannot fill the disk before anybody
 * notices. The JSON body cap on the route is 8 KiB, so this is the inner of
 * two bounds and the one that names the payload specifically.
 */
export const MAX_EVENT_TYPE_CHARS = 64;
export const MAX_EVENT_PAYLOAD_BYTES = 4 * 1024;

/**
 * Serialises a payload, or explains why it will not.
 *
 * Returns `undefined` for "there was no payload", a string for the JSON, and
 * an Error for a payload that cannot be stored. Circular objects and BigInt
 * both make `JSON.stringify` throw, and this is a route reachable from a
 * phone, so both are answers rather than exceptions.
 */
export function serialisePayload(payload: unknown): { json: string | null } | { why: string } {
  if (payload === undefined || payload === null) return { json: null };
  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch {
    return { why: 'that payload could not be written down as JSON' };
  }
  if (json === undefined) return { json: null };
  if (Buffer.byteLength(json) > MAX_EVENT_PAYLOAD_BYTES) {
    return { why: `an event payload is at most ${MAX_EVENT_PAYLOAD_BYTES} bytes of JSON` };
  }
  return { json };
}

/**
 * Writes one event. Returns its id, or null when it could not be written.
 *
 * A null is a counted drop on the scan store, never an exception, and the
 * route still answers `stored: false` rather than a 500: an event that did not
 * land is a fact about our logging, not about the person's request.
 */
export function recordEvent(input: EventInput): number | null {
  const deviceId = input.deviceId?.trim();
  const type = input.type?.trim();
  if (!deviceId || !type) return null;
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const payload = serialisePayload(input.payload);
    if ('why' in payload) throw new Error(payload.why);
    const result = store.db
      .prepare('INSERT INTO event (device_id, type, payload, created_at, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(
        deviceId,
        type.slice(0, MAX_EVENT_TYPE_CHARS),
        payload.json,
        input.createdAt ?? new Date().toISOString(),
        input.userId ?? null,
      );
    return Number(result.lastInsertRowid);
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return null;
  }
}

export interface EventRange {
  /** ISO date or timestamp, inclusive. Omitted means from the beginning. */
  readonly from?: string;
  /** ISO date or timestamp, EXCLUSIVE. See `endOfDay` for why. */
  readonly to?: string;
  readonly deviceId?: string;
  readonly limit?: number;
}

/**
 * Turns a plain ISO date into the exclusive upper bound that includes that
 * whole day.
 *
 * `--to 2026-09-11` means "through the eleventh", and comparing `created_at`
 * against the bare string `2026-09-11` would exclude every event that day
 * because every real timestamp is `2026-09-11T...` which sorts after it. This
 * is the arithmetic that mistake costs, written once: a bare date becomes the
 * next day at midnight, and anything already carrying a time is left alone.
 */
export function endOfDay(to: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return to;
  const next = new Date(`${to}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/**
 * Reads a date range back, oldest first, which is the order the export writes
 * and the order anybody reading a sequence wants.
 *
 * Never throws. An unreadable store is an empty range, and the export says so
 * rather than printing nothing and exiting zero.
 */
export function readEvents(range: EventRange = {}): EventRow[] {
  const store = activeScanStore() ?? openScanStore();
  try {
    if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (range.from) {
      where.push('created_at >= ?');
      args.push(range.from);
    }
    if (range.to) {
      where.push('created_at < ?');
      args.push(endOfDay(range.to));
    }
    if (range.deviceId) {
      where.push('device_id = ?');
      args.push(range.deviceId);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const limit = Number.isFinite(range.limit) && (range.limit ?? 0) > 0 ? ` LIMIT ${Math.floor(range.limit!)}` : '';
    return store.db
      .prepare(`SELECT * FROM event${clause} ORDER BY created_at ASC, id ASC${limit}`)
      .all(...args) as unknown as EventRow[];
  } catch (err) {
    store.dropped += 1;
    store.droppedWhy = err instanceof Error ? err.message : String(err);
    return [];
  }
}

/**
 * One event as one line of JSON, the shape plan item 10c asks for.
 *
 * The payload is re-parsed and nested rather than left as a string, because
 * the consumer of a JSON-lines dump is a pipe into `jq`, and `.payload.tier`
 * failing on a string is the whole reason people stop using an export. A
 * payload that will not parse is kept verbatim under `payloadRaw` instead of
 * being dropped, because a row that cannot be read is the interesting one.
 */
export function eventLine(row: EventRow): string {
  let payload: unknown = null;
  let raw: string | null = null;
  if (row.payload !== null) {
    try {
      payload = JSON.parse(row.payload);
    } catch {
      raw = row.payload;
    }
  }
  const line: Record<string, unknown> = {
    id: row.id,
    at: row.created_at,
    deviceId: row.device_id,
    type: row.type,
    payload,
  };
  if (raw !== null) line.payloadRaw = raw;
  if (row.user_id !== null) line.userId = row.user_id;
  return JSON.stringify(line);
}
