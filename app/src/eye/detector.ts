/**
 * Finding the thing in the frame. Decisions 5, 6 and 9.
 *
 * Decision 5 says a box the app draws beats an instruction the user follows. The
 * hard part is that there is no single model that boxes arbitrary retail
 * packaging: general detectors know about eighty classes and "box of pasta" is
 * not one of them. So this runs two detectors and takes the union.
 *
 *   1. MediaPipe's object detector, which knows the eighty COCO classes. More of
 *      a grocery shelf falls inside those than you would guess -- bottle, cup,
 *      bowl, banana, apple, orange, carrot, broccoli, sandwich, pizza, donut,
 *      cake, book, cell phone, laptop, mouse, keyboard, remote, clock, vase --
 *      and where it fires it is precise and it names what it saw.
 *   2. A gradient saliency pass written here, which knows nothing and works on
 *      anything: it finds the largest coherent high-detail region near the
 *      centre of frame. That is a box of cereal, a jar, a shampoo bottle, or a
 *      thing no class list has ever heard of.
 *
 * WHAT THE PLAN SAID AND WHY THIS DIFFERS. The build plan named OpenCV.js as the
 * second detector. It is dropped, and the reason is not build effort: OpenCV.js
 * is roughly eight megabytes of WebAssembly that has to arrive before the camera
 * can draw its first box, over a shop's wifi, on a phone. That is a user-facing
 * cost paid by every session in exchange for contour finding this file does in a
 * hundred lines. Bundle weight before first use is user experience, so the
 * smaller purpose-built pass wins on the same grounds every other decision here
 * was made on.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  readonly box: Box;
  /** What the class detector called it, when it was the one that fired. */
  readonly label: string | null;
  readonly score: number;
  readonly from: 'classes' | 'saliency';
}

/** Working width for the saliency pass. Full resolution buys nothing here. */
const WORK_WIDTH = 192;

/**
 * Boxes the largest coherent detailed region, preferring the middle of frame.
 *
 * Deliberately not a threshold on brightness or colour: a shelf is a wall of
 * colour and the product being pointed at is not distinguished by being bright,
 * it is distinguished by being close, which makes it the most detailed thing in
 * the frame. Gradient energy is a direct proxy for that.
 */
export function salientBox(source: CanvasImageSource, sw: number, sh: number): Detection | null {
  const scale = Math.min(1, WORK_WIDTH / Math.max(sw, 1));
  const w = Math.max(8, Math.round(sw * scale));
  const h = Math.max(8, Math.round(sh * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const grey = new Float32Array(w * h);
  for (let i = 0, p = 0; i < grey.length; i += 1, p += 4) {
    grey[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
  }

  // Sobel magnitude.
  const mag = new Float32Array(w * h);
  let magSum = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx =
        -grey[i - w - 1] + grey[i - w + 1] -
        2 * grey[i - 1] + 2 * grey[i + 1] -
        grey[i + w - 1] + grey[i + w + 1];
      const gy =
        -grey[i - w - 1] - 2 * grey[i - w] - grey[i - w + 1] +
        grey[i + w - 1] + 2 * grey[i + w] + grey[i + w + 1];
      const m = Math.sqrt(gx * gx + gy * gy);
      mag[i] = m;
      magSum += m;
    }
  }
  const mean = magSum / (w * h);
  if (mean < 1) return null; // a blank wall has no salient anything

  let varSum = 0;
  for (const m of mag) varSum += (m - mean) * (m - mean);
  const std = Math.sqrt(varSum / (w * h));
  const threshold = mean + 0.5 * std;

  // Connected components over the thresholded map, iterative so a large region
  // cannot blow the stack on a phone.
  const labels = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let best: { area: number; minX: number; minY: number; maxX: number; maxY: number; energy: number } | null = null;
  let next = 0;

  const cx = w / 2;
  const cy = h / 2;

  for (let start = 0; start < mag.length; start += 1) {
    if (labels[start] !== -1 || mag[start] < threshold) continue;
    const id = next;
    next += 1;
    stack.push(start);
    labels[start] = id;

    let area = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let energy = 0;

    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      area += 1;
      energy += mag[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // 8-connected: packaging edges are diagonal as often as not.
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (labels[ni] !== -1 || mag[ni] < threshold) continue;
          labels[ni] = id;
          stack.push(ni);
        }
      }
    }

    if (area < (w * h) / 400) continue;

    // Centre weighting. Two regions of equal energy, the one being pointed at is
    // the one in the middle: that is what pointing a camera means.
    const bx = (minX + maxX) / 2;
    const by = (minY + maxY) / 2;
    const dist = Math.hypot((bx - cx) / w, (by - cy) / h);
    const weighted = energy * (1 - Math.min(0.7, dist));

    if (!best || weighted > best.energy) {
      best = { area, minX, minY, maxX, maxY, energy: weighted };
    }
  }

  if (!best) return null;

  const inv = 1 / scale;
  const box: Box = {
    x: best.minX * inv,
    y: best.minY * inv,
    width: Math.max(1, (best.maxX - best.minX) * inv),
    height: Math.max(1, (best.maxY - best.minY) * inv),
  };

  // A region covering nearly the whole frame is the shelf, not a product, and
  // cropping to it is the same as not cropping.
  if (box.width * box.height > sw * sh * 0.92) return null;

  return { box, label: null, score: Math.min(1, best.energy / (mean * w * h * 0.2)), from: 'saliency' };
}

/**
 * The class detector, loaded lazily.
 *
 * Kept behind its own loader so a slow or blocked model download degrades to
 * saliency-only rather than to no boxes at all. Decision 5 is that a box always
 * exists; which detector drew it is an implementation detail the user never sees.
 */
export class ObjectDetector {
  #detector: unknown = null;
  #failed = false;
  readonly #wasmBase: string;
  readonly #modelUrl: string;

  constructor(wasmBase: string, modelUrl: string) {
    this.#wasmBase = wasmBase;
    this.#modelUrl = modelUrl;
  }

  async load(): Promise<boolean> {
    if (this.#detector) return true;
    if (this.#failed) return false;
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(this.#wasmBase);
      this.#detector = await vision.ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: this.#modelUrl, delegate: 'GPU' },
        scoreThreshold: 0.35,
        maxResults: 5,
        runningMode: 'VIDEO',
      });
      return true;
    } catch {
      this.#failed = true;
      return false;
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): Detection[] {
    const d = this.#detector as
      | { detectForVideo(v: HTMLVideoElement, t: number): { detections: unknown[] } }
      | null;
    if (!d) return [];
    try {
      const result = d.detectForVideo(video, timestampMs);
      return (result.detections as {
        boundingBox?: { originX: number; originY: number; width: number; height: number };
        categories?: { categoryName?: string; score?: number }[];
      }[])
        .filter((x) => x.boundingBox)
        .map((x) => ({
          box: {
            x: x.boundingBox!.originX,
            y: x.boundingBox!.originY,
            width: x.boundingBox!.width,
            height: x.boundingBox!.height,
          },
          label: x.categories?.[0]?.categoryName ?? null,
          score: x.categories?.[0]?.score ?? 0,
          from: 'classes' as const,
        }));
    } catch {
      return [];
    }
  }
}

/**
 * Merges both detectors into what the screen should draw.
 *
 * Decision 9: two salient objects means two boxes and a tap, never a guess. So
 * overlapping detections are merged and genuinely separate ones are all kept and
 * returned in order, rather than the strongest being silently chosen.
 */
export function mergeDetections(a: Detection[], b: Detection[]): Detection[] {
  const all = [...a, ...b].sort((x, y) => y.score - x.score);
  const kept: Detection[] = [];
  for (const d of all) {
    // A class detection and a saliency blob on the same object should be one box.
    // The class one wins, because it also carries a name.
    const overlaps = kept.some((k) => iou(k.box, d.box) > 0.4);
    if (!overlaps) kept.push(d);
  }
  return kept.slice(0, 3);
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  return inter / (a.width * a.height + b.width * b.height - inter);
}

/**
 * The centre box, used when both detectors come up empty.
 *
 * Never returns null, because decision 5's promise is that a box always exists:
 * a frame with no box means the screen has nothing to draw and falls back to
 * telling the user to line something up, which is the behaviour being replaced.
 */
export function centreFallback(sw: number, sh: number): Detection {
  const size = Math.min(sw, sh) * 0.7;
  return {
    box: { x: (sw - size) / 2, y: (sh - size) / 2, width: size, height: size },
    label: null,
    score: 0,
    from: 'saliency',
  };
}
