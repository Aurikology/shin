/**
 * A device id is a name; this is the proof that goes with it.
 *
 * D-145, D-155, D-156, D-158, D-159 (2026-09-22): every route that answered
 * about a device took the id from the request and believed it. Anyone who
 * knew a device id could read its consent and its quota, switch its photo
 * consent on, write events as it, and rate its scans.
 *
 * THE FIX IS A SECRET BESIDE THE ID. The phone makes a random secret when it
 * makes its id (`device.js`) and sends it on every request in
 * `x-shin-device-key` (`api.js`). The first request that carries a secret for
 * a device binds the two: only a hash of the secret is stored, never the
 * secret. From then on a request about that device is answered only when it
 * carries the same secret.
 *
 * A DEVICE WITH NO SECRET YET STILL WORKS. The phones already in testers'
 * hands have an id and no secret. Refusing them would lock the beta out on
 * the day this ships, so an id that has never been bound is answered as it
 * always was, and it binds the first time the updated app sends its secret.
 * Until then that id is exactly as exposed as before; that is the price of
 * not locking anybody out, and it closes by itself as phones update.
 *
 * BINDING ONLY FOR THE DEVICE THE REQUEST SAYS IT IS. A secret binds the id
 * in the `x-shin-device` header and no other, so a request that names a
 * second id in its body cannot tie that second id to its own secret.
 *
 * FAILS CLOSED. A store that cannot be read could be hiding a binding, and
 * answering an unknown about somebody else's device is the error this file
 * exists to stop.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { activeScanStore, openScanStore } from './scans.ts';

export const DEVICE_KEY_HEADER = 'x-shin-device-key';
export const DEVICE_HEADER = 'x-shin-device';

/** The sentence a refused request gets. Flat, like the invite refusal: the reader is not a shopper. */
export const DEVICE_REFUSAL = 'That request is about a device it cannot prove it is.';

/** A secret the phone could have made: `crypto.randomUUID()` or hex, and nothing short. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

function one(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** The secret a request carried, or null when it carried none or one of the wrong shape. */
export function deviceKeyOf(headers: IncomingHttpHeaders): string | null {
  const key = one(headers[DEVICE_KEY_HEADER]);
  return key && KEY_SHAPE.test(key) ? key : null;
}

/** The device a request says it is, from its header. */
export function deviceHeaderOf(headers: IncomingHttpHeaders): string | null {
  return one(headers[DEVICE_HEADER]);
}

function hash(key: string): Buffer {
  return createHash('sha256').update(key, 'utf8').digest();
}

let tableReady: object | null = null;

function db() {
  const store = activeScanStore() ?? openScanStore();
  if (!store.db) throw new Error(store.droppedWhy || 'scan store is not open');
  if (tableReady !== store.db) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS device_key (
      device_id TEXT PRIMARY KEY,
      key_hash  BLOB NOT NULL,
      bound_at  TEXT NOT NULL)`);
    tableReady = store.db;
  }
  return store.db;
}

/**
 * Tie the request's own device to the secret it carried, if that device has
 * no secret yet. Called once per request, before any route. Never throws.
 */
export function bindDevice(headers: IncomingHttpHeaders, now: Date = new Date()): void {
  const id = deviceHeaderOf(headers);
  const key = deviceKeyOf(headers);
  if (!id || !key) return;
  try {
    db()
      .prepare('INSERT OR IGNORE INTO device_key (device_id, key_hash, bound_at) VALUES (?, ?, ?)')
      .run(id, hash(key), now.toISOString());
  } catch {
    // Not bound this time; the next request tries again.
  }
}

/**
 * May this request act for `deviceId`? True for an id with no secret bound
 * yet (see the header), and for a bound id only when the request carries the
 * same secret. An empty id is left to the route's own 400.
 */
export function ownsDevice(deviceId: string, headers: IncomingHttpHeaders): boolean {
  const id = deviceId?.trim();
  if (!id) return true;
  try {
    const row = db().prepare('SELECT key_hash FROM device_key WHERE device_id = ?').get(id) as
      | { key_hash: Uint8Array }
      | undefined;
    if (!row) return true;
    const key = deviceKeyOf(headers);
    if (!key) return false;
    const want = Buffer.from(row.key_hash);
    const got = hash(key);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}
