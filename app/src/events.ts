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
 * WHAT MAY GO IN A PAYLOAD. Free text a person typed may (2026-09-14, "build
 * everything for collecting EVERYTHING"). AN EXACT POSITION MAY NOT, and this
 * reverses what this comment said from 2026-09-14 to 2026-10-09 ("coordinates
 * ... are no longer refused here"): Aurik's ruling the same day (RULINGS.md
 * "Location and photo consent default off until answered": "only a coarse
 * kilometre-wide cell is stored, never exact GPS") and requirement 5.6 ("0
 * exact positions stored") govern every table, this one included. So
 * `recordEvent` runs `scrubPosition` first: a key that names a position
 * (`POSITION_KEYS` in migrations.ts: lat, lon, accuracy, coords, gps ...) is
 * dropped with its value, and a precise "lat,lon" pair inside any string is
 * snapped to the kilometre cell. The rest of the event is kept, and each
 * scrub is logged and counted as `[customer-data-fault]
 * exact_position_dropped`, because a client sending one is a bug to find.
 * Migration 20's trigger refuses such a payload in the database as well.
 * A photo's own bytes are refused too: those belong in the photos folder
 * behind the photo consent flag (`photos.ts`) or nowhere, never as base64 in
 * this table, so that deleting a photo on the retention sweep (when one is
 * configured) or on request actually removes it rather than leaving a copy
 * sitting in an event payload nothing sweeps.
 *
 * NEVER THROWS, the same contract `scans.ts` keeps and for the same reason: a
 * camera loop that cannot write down what it just did must still answer the
 * person in front of it. An event that could not be stored is a counted drop
 * on the shared store handle.
 */

import { activeScanStore, openScanStore, reportScanFault } from './scans.ts';
import { POSITION_KEYS } from './migrations.ts';
import { parseCell } from './stores.ts';
import { customerDataFault } from './customer-data-faults.ts';

/** Three or more decimals on both halves of a "lat,lon" pair: finer than the kilometre cell. */
const PRECISE_PAIR = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;
const POSITION_KEY_SET: ReadonlySet<string> = new Set(POSITION_KEYS);

function positionKey(key: string): boolean {
  return POSITION_KEY_SET.has(key.toLowerCase().replace(/[_\-\s]/g, ''));
}

/**
 * Requirement 5.6, applied to an event payload before it is serialised. Keys
 * that name a position are dropped with their values, at any depth; a precise
 * "lat,lon" pair inside a string is snapped to the kilometre cell (or removed
 * when it is not a real coordinate). Returns the scrubbed copy and how many
 * things were dropped or snapped. The input is never mutated.
 */
export function scrubPosition(value: unknown): { value: unknown; scrubbed: number } {
  let scrubbed = 0;
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 32) return v;
    if (typeof v === 'string') {
      return v.replace(PRECISE_PAIR, (pair) => {
        scrubbed += 1;
        return parseCell(pair.replace(/\s+/g, ''))?.text ?? '';
      });
    }
    if (Array.isArray(v)) return v.map((item) => walk(item, depth + 1));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, item] of Object.entries(v)) {
        if (positionKey(k)) {
          scrubbed += 1;
          continue;
        }
        out[k] = walk(item, depth + 1);
      }
      return out;
    }
    return v;
  };
  return { value: walk(value, 0), scrubbed };
}

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
const MAX_EVENT_TYPE_CHARS = 64;
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
    // Requirement 5.6: no exact position reaches this table. The event is kept; the position is not.
    const scrub = scrubPosition(input.payload);
    if (scrub.scrubbed > 0) {
      customerDataFault('exact_position_dropped', `event type ${type.slice(0, MAX_EVENT_TYPE_CHARS)}: ${scrub.scrubbed} position field(s) dropped or snapped`);
    }
    const payload = serialisePayload(scrub.value);
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
    reportScanFault('recordEvent', null, err);
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
