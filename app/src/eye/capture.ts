/**
 * Burst capture, sharpness scoring, and the crop. Decisions 6, 7, 8 and 12.
 *
 * WHY A BURST. Decision 7. The most common reason an identification comes back
 * wrong is not the model; it is that the photo was blurred by the hand holding
 * it, in an aisle, under lights that force a long exposure. The user never finds
 * out that is what happened, so they conclude the app is bad at recognising
 * things. Capturing several frames around the trigger and keeping the sharpest
 * costs a few dozen milliseconds and removes the whole failure.
 *
 * WHY VARIANCE OF THE LAPLACIAN. It is the standard focus measure and it needs
 * no model: a sharp image has strong second derivatives everywhere there is an
 * edge, a blurred one has weak ones. Computed on a downscaled greyscale copy so
 * scoring eight frames stays under a frame budget.
 *
 * WHY THE CROP IS NEVER SILENT. Decision 8. An automatic crop that cut off the
 * word "unsweetened" produces a wrong answer the user cannot explain and cannot
 * correct, because they never saw what was sent. This module returns the crop
 * and its box; the screen is required to show it before it goes anywhere.
 *
 * WHY FULL QUALITY. Decision 12. The identity of a product is in its fine print.
 * Compressing the crop to save bandwidth trades the one thing being measured for
 * a few kilobytes, so the encode here is lossless and the resize is only ever
 * down to the model's own tile size, never below it.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScoredFrame {
  readonly bitmap: ImageBitmap;
  /** Variance of the Laplacian. Higher is sharper. Only comparable within a burst. */
  readonly sharpness: number;
  readonly at: number;
}

/** Downscaled width used for scoring. Small enough to be cheap, big enough to rank. */
const SCORE_WIDTH = 240;

/**
 * Sharpness of one frame.
 *
 * Exported because the live view uses the same number to decide when the scene
 * has settled enough to auto-capture (decision 6), and using two different
 * measures for "is it sharp" would let the trigger fire on frames the scorer
 * then rejects.
 */
export function sharpnessOf(source: ImageBitmap | HTMLVideoElement | ImageData): number {
  const { data, width, height } = toGrey(source);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  // 4-neighbour Laplacian. Borders skipped rather than clamped: a clamped border
  // invents an edge and inflates the score of a frame with a dark surround.
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap =
        4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function toGrey(source: ImageBitmap | HTMLVideoElement | ImageData): {
  data: Float32Array;
  width: number;
  height: number;
} {
  let width: number;
  let height: number;
  let pixels: Uint8ClampedArray;

  if (source instanceof ImageData) {
    width = source.width;
    height = source.height;
    pixels = source.data;
  } else {
    const sw = 'videoWidth' in source ? source.videoWidth : source.width;
    const sh = 'videoHeight' in source ? source.videoHeight : source.height;
    const scale = Math.min(1, SCORE_WIDTH / Math.max(sw, 1));
    width = Math.max(1, Math.round(sw * scale));
    height = Math.max(1, Math.round(sh * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    pixels = ctx.getImageData(0, 0, width, height).data;
  }

  const grey = new Float32Array(width * height);
  for (let i = 0, p = 0; i < grey.length; i += 1, p += 4) {
    // Rec. 601 luma. Plain averaging makes a red label and a green one score
    // differently for no reason a shopper would recognise.
    grey[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  }
  return { data: grey, width, height };
}

/**
 * Grabs several frames in a row and returns them scored, sharpest first.
 *
 * The burst is taken around the trigger rather than after it, because the moment
 * a user decides to press is usually the moment the phone is steadiest, and
 * frames captured after the press include the press itself.
 */
export async function burst(
  video: HTMLVideoElement,
  count = 7,
  gapMs = 45,
): Promise<ScoredFrame[]> {
  const frames: ScoredFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    const bitmap = await createImageBitmap(video);
    frames.push({ bitmap, sharpness: sharpnessOf(bitmap), at: Date.now() });
    if (i < count - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  return frames.sort((a, b) => b.sharpness - a.sharpness);
}

/** Frees the frames a burst did not need. Bitmaps hold real memory on a phone. */
export function releaseAllBut(frames: ScoredFrame[], keep: ScoredFrame): void {
  for (const f of frames) if (f !== keep) f.bitmap.close();
}

export interface CropResult {
  readonly blob: Blob;
  readonly box: Box;
  readonly width: number;
  readonly height: number;
  readonly sharpness: number;
}

/** How much room is left around the detected box. Labels run to the edges. */
const PAD = 0.08;

/**
 * Crops to a box, padded, and encodes losslessly.
 *
 * `maxEdge` exists so a 4000px phone photo is not sent at 4000px, which buys
 * nothing a model can use and costs seconds on a shop's wifi. It never upscales
 * and never crosses below the model's tile size, so the fine print survives.
 */
export async function cropTo(
  frame: ScoredFrame,
  box: Box,
  maxEdge = 1568,
): Promise<CropResult> {
  const bw = frame.bitmap.width;
  const bh = frame.bitmap.height;

  const padX = box.width * PAD;
  const padY = box.height * PAD;
  const x = Math.max(0, Math.floor(box.x - padX));
  const y = Math.max(0, Math.floor(box.y - padY));
  const width = Math.min(bw - x, Math.ceil(box.width + padX * 2));
  const height = Math.min(bh - y, Math.ceil(box.height + padY * 2));

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(frame.bitmap, x, y, width, height, 0, 0, outW, outH);

  // PNG, not JPEG. Decision 12: the identity is the fine print, and JPEG ringing
  // around small high-contrast text is exactly what a lossy encoder spends first.
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { blob, box: { x, y, width, height }, width: outW, height: outH, sharpness: frame.sharpness };
}

/**
 * Whether the scene has settled enough to fire the shutter by itself (decision 6).
 *
 * Two conditions, both required: the box has stopped moving, and the frame is
 * sharp. Stillness alone fires on a steadily-held blurred frame; sharpness alone
 * fires mid-sweep on a lucky crisp frame of the wrong product.
 */
export class StabilityGate {
  #history: { box: Box; sharpness: number; at: number }[] = [];
  readonly #holdMs: number;
  readonly #driftTolerance: number;

  constructor(holdMs = 500, driftTolerance = 0.06) {
    this.#holdMs = holdMs;
    this.#driftTolerance = driftTolerance;
  }

  /** Returns true the moment the scene has been stable and sharp for long enough. */
  update(box: Box | null, sharpness: number, frameWidth: number): boolean {
    const now = Date.now();
    if (!box) {
      this.#history = [];
      return false;
    }
    this.#history.push({ box, sharpness, at: now });
    this.#history = this.#history.filter((h) => now - h.at <= this.#holdMs);
    if (this.#history.length < 4) return false;
    if (now - this.#history[0].at < this.#holdMs) return false;

    const tolerance = frameWidth * this.#driftTolerance;
    const first = this.#history[0].box;
    const drifted = this.#history.some(
      (h) =>
        Math.abs(h.box.x - first.x) > tolerance ||
        Math.abs(h.box.y - first.y) > tolerance ||
        Math.abs(h.box.width - first.width) > tolerance,
    );
    if (drifted) return false;

    // Sharpness is only comparable within a scene, so the test is relative: the
    // current frame must be at least as sharp as the median of the hold window.
    const scores = this.#history.map((h) => h.sharpness).sort((a, b) => a - b);
    const median = scores[Math.floor(scores.length / 2)];
    return this.#history[this.#history.length - 1].sharpness >= median;
  }

  reset(): void {
    this.#history = [];
  }
}
