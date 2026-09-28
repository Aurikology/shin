/**
 * The shutter frame write, bounded. D-160 (2026-09-22).
 *
 * One client wrote 42 MB of disk in 788 ms: forty requests, a 1 MB JPEG each,
 * under forty press ids it made up, all accepted. The route carried no device
 * at all, and nothing counted or checked the disk. A press is a person tapping
 * a button, so a phone that sends more than the per-device cap in a day is
 * broken or is not a phone; the total holds when the device ids are invented
 * too, and the byte ceiling holds at the 16 MB request cap. See disk-guard.ts
 * for why all three.
 *
 * A SEPARATE FILE FROM shutter-log.ts ON PURPOSE. That file sits inside the
 * admin/access-log import cycle, and giving it one more import changed module
 * load timing enough to break an unrelated test file whose tests race a
 * top-level `await import('../server.ts')` (repeat-cache.test.ts). The write
 * itself is still `saveShutterFrame` there; this decides whether it runs.
 */
import { saveShutterFrame, shutterDir, shutterLogOn } from './shutter-log.ts';
import { DailyCounter, diskHasRoom, freeBytes } from './disk-guard.ts';

export const SHUTTER_DEVICE_DAILY_CAP = 300;
export const SHUTTER_TOTAL_DAILY_CAP = 3000;
const SHUTTER_TOTAL_DAILY_BYTES = 2 * 1024 * 1024 * 1024;
/** Where frames with no device header are counted: together, as one device. */
const NO_DEVICE = '(none)';

const counts = new DailyCounter({
  perDevice: SHUTTER_DEVICE_DAILY_CAP,
  total: SHUTTER_TOTAL_DAILY_CAP,
  totalBytes: SHUTTER_TOTAL_DAILY_BYTES,
});

export function resetShutterCountsForTests(): void {
  counts.reset();
}

export interface ShutterFrameOptions {
  /** The device the request says it is (the `x-shin-device` header), already checked by the route. */
  readonly deviceId?: string | null;
  readonly now?: Date;
  /** Free bytes on a disk, for the low-disk guard. Tests pass their own. */
  readonly free?: (dir: string) => number | null;
}

/**
 * Save one shutter frame if the caps and the disk allow it. Answers the HTTP
 * status: those of `saveShutterFrame` (204, 400, 404, 500), plus 429 past a
 * daily cap and 507 when the disk is nearly full. Only a saved frame counts.
 */
export function saveCappedShutterFrame(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
  options: ShutterFrameOptions = {},
): number {
  if (!shutterLogOn(env)) return 404;
  const frame = body && typeof body === 'object' ? (body as { frame?: unknown }).frame : undefined;
  if (typeof frame !== 'string') return 400;
  const size = Buffer.byteLength(frame, 'base64');
  const device = options.deviceId?.trim() || NO_DEVICE;
  const day = (options.now ?? new Date()).toISOString().slice(0, 10);
  if (counts.check(device, size, day) !== 'ok') return 429;
  if (!diskHasRoom(shutterDir(env), options.free ?? freeBytes)) return 507;
  const status = saveShutterFrame(body, env);
  if (status === 204) counts.add(device, size, day);
  return status;
}
