/**
 * The live camera loop. Decisions 1, 6, 9, 11 and 14.
 *
 * This is the piece that makes the viewfinder feel like it is paying attention
 * rather than waiting to be told. It starts scanning the instant the stream is
 * live (decision 1), keeps a box on whatever it can find (decision 5, in
 * `detector.ts`), fires the shutter itself when the scene settles (decision 6),
 * and turns the torch on by itself in a dim aisle (decision 11).
 *
 * The barcode reader and the detector run at different rates on purpose. Barcode
 * decoding is the cheap one and the one that ends the session fastest, so it
 * gets every frame it can have. Detection is heavier and only feeds a box the
 * user looks at, so it runs slower and nobody notices.
 */

import { BarcodeScanner, type StableRead } from './barcode.ts';
import {
  ObjectDetector,
  salientBox,
  mergeDetections,
  centreFallback,
  type Detection,
} from './detector.ts';
import { StabilityGate, sharpnessOf, burst, releaseAllBut, cropTo, type CropResult } from './capture.ts';

export interface CameraEvents {
  /** A confirmed barcode. The session usually ends here. */
  onBarcode(read: StableRead): void;
  /** Boxes to draw. Called often; keep the handler cheap. */
  onBoxes(boxes: Detection[], frameWidth: number, frameHeight: number): void;
  /** The shutter fired, by itself or by hand, and here is the crop. */
  onCapture(crop: CropResult, detection: Detection): void;
  /** Torch state changed, so the toggle can reflect what actually happened. */
  onTorch?(on: boolean): void;
  /** Something the user should be told, in their words, not ours. */
  onTrouble?(message: string): void;
}

export interface CameraOptions {
  readonly video: HTMLVideoElement;
  readonly events: CameraEvents;
  readonly wasmUrl?: string;
  readonly mediapipeWasmBase?: string;
  readonly detectorModelUrl?: string;
  /** Off for users who would rather press the button themselves. */
  readonly autoCapture?: boolean;
}

/** Below this mean luminance the aisle is too dark to read a label. */
const DARK_THRESHOLD = 52;
/** How long it has to stay dark before the torch comes on, so a passing shadow does not flash it. */
const DARK_HOLD_MS = 700;

const DETECT_EVERY_MS = 180;

export class Camera {
  readonly #video: HTMLVideoElement;
  readonly #events: CameraEvents;
  readonly #scanner: BarcodeScanner;
  readonly #detector: ObjectDetector | null;
  readonly #gate = new StabilityGate();
  readonly #autoCapture: boolean;

  #stream: MediaStream | null = null;
  #running = false;
  #lastDetect = 0;
  #boxes: Detection[] = [];
  #darkSince: number | null = null;
  #torchOn = false;
  #capturing = false;
  #scanCanvas: OffscreenCanvas | null = null;

  constructor(options: CameraOptions) {
    this.#video = options.video;
    this.#events = options.events;
    this.#autoCapture = options.autoCapture ?? true;
    this.#scanner = new BarcodeScanner({ wasmUrl: options.wasmUrl });
    this.#detector =
      options.mediapipeWasmBase && options.detectorModelUrl
        ? new ObjectDetector(options.mediapipeWasmBase, options.detectorModelUrl)
        : null;
  }

  async start(): Promise<void> {
    // The back camera, as high as it will go. Decision 12's fine print has to
    // survive being cropped to a fifth of the frame.
    this.#stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    this.#video.srcObject = this.#stream;
    await this.#video.play();

    // Warmed before the first frame rather than on it: a module load during the
    // first second reads as the camera being broken (decision 1).
    void this.#scanner.warm();
    void this.#detector?.load();

    this.#running = true;
    this.#loop();
  }

  stop(): void {
    this.#running = false;
    this.#scanner.reset();
    this.#gate.reset();
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = null;
  }

  /** The manual shutter. Always available; decision 6 keeps it as the override. */
  async capture(): Promise<void> {
    await this.#doCapture();
  }

  async setTorch(on: boolean): Promise<boolean> {
    const track = this.#stream?.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      this.#torchOn = on;
      this.#events.onTorch?.(on);
      return true;
    } catch {
      // Not every device exposes the torch. Not an error, and never surfaced as
      // one: the user did not ask for a torch, the app decided it wanted one.
      return false;
    }
  }

  #frameToImageData(): ImageData | null {
    const w = this.#video.videoWidth;
    const h = this.#video.videoHeight;
    if (w === 0 || h === 0) return null;
    // Barcodes decode fine at 960 wide and it is four times less work than 1920.
    const scale = Math.min(1, 960 / w);
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    if (!this.#scanCanvas || this.#scanCanvas.width !== cw || this.#scanCanvas.height !== ch) {
      this.#scanCanvas = new OffscreenCanvas(cw, ch);
    }
    const ctx = this.#scanCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.#video, 0, 0, cw, ch);
    return ctx.getImageData(0, 0, cw, ch);
  }

  #loop(): void {
    if (!this.#running) return;
    void this.#tick().finally(() => {
      if (this.#running) requestAnimationFrame(() => this.#loop());
    });
  }

  async #tick(): Promise<void> {
    if (this.#capturing) return;
    const frame = this.#frameToImageData();
    if (!frame) return;

    // Barcode first, every frame. Decision 15: it is truth, and it ends the
    // session faster than anything else can.
    const read = await this.#scanner.scan(frame);
    if (read) {
      this.#events.onBarcode(read);
      return;
    }

    this.#checkLight(frame);

    const now = performance.now();
    if (now - this.#lastDetect >= DETECT_EVERY_MS) {
      this.#lastDetect = now;
      const sw = this.#video.videoWidth;
      const sh = this.#video.videoHeight;
      const classes = this.#detector?.detect(this.#video, now) ?? [];
      const salient = salientBox(this.#video, sw, sh);
      const merged = mergeDetections(classes, salient ? [salient] : []);
      this.#boxes = merged.length > 0 ? merged : [centreFallback(sw, sh)];
      this.#events.onBoxes(this.#boxes, sw, sh);

      if (this.#autoCapture && merged.length === 1) {
        // Decision 9: never auto-fire when there is more than one thing it could
        // be. Two boxes means the user taps, and the gate is held open.
        const sharp = sharpnessOf(frame);
        if (this.#gate.update(this.#boxes[0].box, sharp, sw)) {
          await this.#doCapture();
        }
      } else {
        this.#gate.reset();
      }
    }
  }

  #checkLight(frame: ImageData): void {
    let sum = 0;
    const d = frame.data;
    // Every 64th pixel: mean luminance does not need all two million of them.
    for (let i = 0; i < d.length; i += 256) {
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const mean = sum / (d.length / 256);
    const now = Date.now();

    if (mean < DARK_THRESHOLD) {
      this.#darkSince ??= now;
      if (!this.#torchOn && now - this.#darkSince > DARK_HOLD_MS) void this.setTorch(true);
    } else {
      this.#darkSince = null;
      if (this.#torchOn && mean > DARK_THRESHOLD * 1.6) void this.setTorch(false);
    }
  }

  async #doCapture(): Promise<void> {
    if (this.#capturing) return;
    this.#capturing = true;
    this.#gate.reset();
    try {
      const target = this.#boxes[0] ?? centreFallback(this.#video.videoWidth, this.#video.videoHeight);
      const frames = await burst(this.#video);
      const best = frames[0];
      releaseAllBut(frames, best);
      const crop = await cropTo(best, target.box);
      best.bitmap.close();
      this.#events.onCapture(crop, target);
    } catch (err) {
      this.#events.onTrouble?.('The camera did not manage that shot. Try once more.');
    } finally {
      this.#capturing = false;
    }
  }
}
