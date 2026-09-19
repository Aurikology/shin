/**
 * When to keep a picture of the shelf, decided.
 *
 * Jamin, 2026-09-17: "while the camera is open ... continuous collect data not
 * just on the item its focused on but on all the items around it. Cropped
 * photos of what the camera sees can be constantly sent to the server to be
 * saved. Espeically on store shelves, the product tag will contain the price
 * of the item, the name of the item, and in the same photo frame, the item will
 * also be there. This is very valuable data."
 *
 * STORAGE ONLY. Nothing here or on the server calls a model per picture.
 *
 * THREE WAYS IT MUST NEVER COST THE SHOPPER ANYTHING:
 *   - It never runs while a scan is under way (`busy`): the viewfinder and the
 *     scan have the phone to themselves.
 *   - It never sends the same shelf twice (`similar`), so a phone held still
 *     for a minute is one picture and not sixty.
 *   - It is throttled twice: a minimum gap between pictures, and a cap per
 *     camera visit, so the worst case is a number you can write down.
 *
 * CONSENT is the existing photo consent and it is checked by the caller on
 * every tick, then again by the server. This file only refuses when told the
 * consent is off.
 *
 * Nothing about battery or data use is measured here, because neither can be
 * measured off a phone. The two constants below are the dials for the day
 * somebody does.
 */

/** Fewest ms between two pictures. */
export const SHELF_MIN_GAP_MS = 5000;
/** Most pictures one camera visit sends. */
export const SHELF_MAX_PER_VISIT = 40;
/** How different a frame's signature has to be from the last sent to count as a new view. 0 to 1. */
export const SHELF_MIN_CHANGE = 0.08;

export interface ShelfState {
  readonly lastAt: number | null;
  readonly sent: number;
  /** A signature of the last picture sent, or null before the first. */
  readonly lastSignature: readonly number[] | null;
}

export interface ShelfTick {
  readonly now: number;
  readonly consent: boolean;
  /** A scan, a sheet, a pad or a capture is under way. */
  readonly busy: boolean;
  readonly online: boolean;
  /** The signature of the frame on offer now. */
  readonly signature: readonly number[];
  /** Mean luminance, so a black frame (a hand over the lens) is never kept. */
  readonly mean: number;
}

export const SHELF_START: ShelfState = { lastAt: null, sent: 0, lastSignature: null };

/** The longest side of a stored picture. Big enough to read a shelf tag, small enough to be cheap to send. */
export const SHELF_MAX_SIDE = 1280;

/**
 * The part of the video frame the shopper can actually see. The viewfinder is
 * `object-fit: cover`, so the element shows a crop of the frame; the picture
 * kept is that crop, which is what "cropped photos of what the camera sees"
 * means. Returns the source rectangle in video pixels.
 */
export function coverCrop(
  videoWidth: number,
  videoHeight: number,
  elementWidth: number,
  elementHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (!(videoWidth > 0 && videoHeight > 0 && elementWidth > 0 && elementHeight > 0)) {
    return { x: 0, y: 0, width: Math.max(videoWidth, 0), height: Math.max(videoHeight, 0) };
  }
  const frameAspect = videoWidth / videoHeight;
  const viewAspect = elementWidth / elementHeight;
  if (frameAspect > viewAspect) {
    const width = videoHeight * viewAspect;
    return { x: (videoWidth - width) / 2, y: 0, width, height: videoHeight };
  }
  const height = videoWidth / viewAspect;
  return { x: 0, y: (videoHeight - height) / 2, width: videoWidth, height };
}

/** Output size for a crop, never upscaled, longest side at most `SHELF_MAX_SIDE`. */
export function shelfSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height, 1);
  const k = Math.min(1, SHELF_MAX_SIDE / longest);
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export type ShelfVerdict =
  | { readonly send: true; readonly next: ShelfState }
  | { readonly send: false; readonly why: string };

/**
 * A coarse picture of a frame: mean luminance on an 8 by 6 grid, each 0 to 1.
 * Cheap enough to take on a downscaled frame every tick, and different enough
 * between two shelf views to tell them apart.
 */
export function signatureOf(
  frame: { data: Uint8ClampedArray; width: number; height: number },
  cols = 8,
  rows = 6,
): number[] {
  const sums = new Array<number>(cols * rows).fill(0);
  const counts = new Array<number>(cols * rows).fill(0);
  const stepX = Math.max(1, Math.floor(frame.width / 64));
  const stepY = Math.max(1, Math.floor(frame.height / 48));
  for (let y = 0; y < frame.height; y += stepY) {
    const r = Math.min(rows - 1, Math.floor((y / frame.height) * rows));
    for (let x = 0; x < frame.width; x += stepX) {
      const c = Math.min(cols - 1, Math.floor((x / frame.width) * cols));
      const p = (y * frame.width + x) * 4;
      const luma = 0.299 * frame.data[p] + 0.587 * frame.data[p + 1] + 0.114 * frame.data[p + 2];
      sums[r * cols + c] += luma / 255;
      counts[r * cols + c] += 1;
    }
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
}

/** Mean absolute difference between two signatures, 0 (same) to 1. */
export function signatureDistance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 1;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

export function shouldSendShelf(state: ShelfState, tick: ShelfTick): ShelfVerdict {
  if (!tick.consent) return { send: false, why: 'no photo consent' };
  if (tick.busy) return { send: false, why: 'a scan is under way' };
  if (!tick.online) return { send: false, why: 'offline' };
  if (state.sent >= SHELF_MAX_PER_VISIT) return { send: false, why: 'visit cap reached' };
  if (state.lastAt !== null && tick.now - state.lastAt < SHELF_MIN_GAP_MS) return { send: false, why: 'too soon' };
  // A frame with nothing on it: lens covered, or pointed at the floor in the dark.
  if (tick.mean < 12) return { send: false, why: 'too dark to be a shelf' };
  if (state.lastSignature && signatureDistance(state.lastSignature, tick.signature) < SHELF_MIN_CHANGE) {
    return { send: false, why: 'same view as the last one' };
  }
  return {
    send: true,
    next: { lastAt: tick.now, sent: state.sent + 1, lastSignature: tick.signature },
  };
}
