/**
 * Shelf frames: pictures of what the camera sees while it is open, kept and
 * nothing else.
 *
 * Jamin, 2026-09-17: "Cropped photos of what the camera sees can be constantly
 * sent to the server to be saved. Espeically on store shelves, the product tag
 * will contain the price of the item, the name of the item, and in the same
 * photo frame, the item will also be there. This is very valuable data."
 *
 * STORAGE ONLY. No model is called per picture, here or anywhere this file
 * reaches. A picture is written to disk beside a small JSON note (when, how
 * big, the coarse cell if the phone sent one) and that is the whole of it.
 *
 * CONSENT IS THE PHOTO CONSENT, checked here on the server as well as on the
 * phone, for the reason photos.ts gives: one place decides. It is passed in
 * (`keep`) rather than imported so the test can prove both answers without a
 * database; the route hands it `keepPhoto` from consent.ts.
 *
 * A FLOOR UNDER THE PHONE'S THROTTLE. The phone sends at most one picture every
 * few seconds and forty a visit. A phone that is broken, old, or not ours could
 * send more, and a beta's disk is not unlimited, so the server holds its own
 * per-device daily cap and its own size cap. Both are answers (429, 413), never
 * a crash, and neither is ever seen by the shopper.
 *
 * NEVER THROWS. A disk that will not write is a 500 to a background upload the
 * shopper never sees, and nothing else.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { photosDir } from './photos.ts';
import { keepPhoto } from './consent.ts';

/** The body cap the route applies before this is called. */
export const MAX_SHELF_FRAME_BYTES = 3 * 1024 * 1024;
/** Most pictures one device may store in a UTC day. */
export const SHELF_DAILY_CAP = 400;

const DEVICE = /^[A-Za-z0-9_-]{8,64}$/;

/** Counted in memory: a restart forgets it, which only ever lets a few more through. */
const perDay = new Map<string, number>();

export function resetShelfCountsForTests(): void {
  perDay.clear();
}

export interface ShelfOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly keep?: (deviceId: string) => boolean;
  readonly now?: Date;
}

export interface ShelfResult {
  readonly status: 204 | 400 | 403 | 429 | 500;
  readonly error?: string;
  /** Relative to the photos folder, for tests and logs. */
  readonly path?: string;
}

function imageExt(bytes: Buffer): 'jpg' | 'png' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

export function saveShelfFrame(body: unknown, options: ShelfOptions = {}): ShelfResult {
  const env = options.env ?? process.env;
  const keep = options.keep ?? keepPhoto;
  const now = options.now ?? new Date();

  if (!body || typeof body !== 'object') return { status: 400, error: 'a JSON body is required' };
  const b = body as Record<string, unknown>;
  const deviceId = typeof b.deviceId === 'string' ? b.deviceId.trim() : '';
  if (!DEVICE.test(deviceId)) return { status: 400, error: 'deviceId is required' };
  if (typeof b.frame !== 'string') return { status: 400, error: 'frame is required' };

  // Consent before anything else touches the bytes.
  if (!keep(deviceId)) return { status: 403, error: 'photos are not consented to' };

  const bytes = Buffer.from(b.frame, 'base64');
  const ext = imageExt(bytes);
  if (!ext) return { status: 400, error: 'frame is not an image' };
  if (bytes.length > MAX_SHELF_FRAME_BYTES) return { status: 400, error: 'frame is too large' };

  const day = now.toISOString().slice(0, 10);
  const counterKey = `${deviceId}:${day}`;
  const used = perDay.get(counterKey) ?? 0;
  if (used >= SHELF_DAILY_CAP) return { status: 429, error: 'daily shelf limit reached' };

  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const name = `${stamp}-${used}`;
  const rel = join('shelf', day, deviceId, `${name}.${ext}`);
  try {
    const dir = join(photosDir(env), 'shelf', day, deviceId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.${ext}`), bytes);
    writeFileSync(
      join(dir, `${name}.json`),
      JSON.stringify(
        {
          receivedAt: now.toISOString(),
          takenAt: typeof b.takenAt === 'string' ? b.takenAt : null,
          width: Number.isFinite(b.width) ? b.width : null,
          height: Number.isFinite(b.height) ? b.height : null,
          bytes: bytes.length,
          // The coarse cell only, and only if the phone sent one: the phone
          // sends it only under location consent, and it is a note not a key.
          cell: typeof b.cell === 'string' ? b.cell.slice(0, 64) : null,
          appVersion: typeof b.appVersion === 'string' ? b.appVersion.slice(0, 32) : null,
        },
        null,
        2,
      ),
    );
  } catch {
    return { status: 500, error: 'frame not saved' };
  }
  perDay.set(counterKey, used + 1);
  return { status: 204, path: rel };
}
