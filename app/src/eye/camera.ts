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
 * decoding is the cheap one and the one that ends the session fastest, so once
 * it has been asked for it gets every frame it can have. Detection is heavier
 * and only feeds a box the user looks at, so it runs slower and nobody notices.
 *
 * BARCODES, 2026-09-17 (his notes, superseding the 2026-09-15 "asked for" gate):
 * every frame is decoded while the screen is in barcode mode, every code in
 * view is tracked and drawn, and the frames vote in a sliding window
 * (`votes.ts`). Nothing is ever emitted as a read on its own. When a majority
 * of the last second or two agree, `onBarcodeReady` fires so the screen can show
 * its "Scan barcode" button; only `scanBarcode()`, the button's press, sends
 * the digits onward through `onBarcode`. In photo mode zxing is handed nothing.
 *
 * THE GUIDANCE SYSTEM, added on top of that loop and ordered by cost to the
 * user. Everything the camera can do about a bad shot, it does silently, and it
 * only speaks once it has run out of its own moves:
 *
 *   1. It reads every frame while in barcode mode, and reports every code in
 *      view while the vote is still open, so the marks on screen appear before
 *      the button does (`onBarcodes`), and coaches the framing meanwhile.
 *   2. It keeps every object it found rather than the best one, so the user can
 *      tap the one they meant (`select`). Decision 9 promised that tap; this is
 *      where it becomes reachable.
 *   3. It lights the shelf itself, and it puts the torch back out when the
 *      torch is the thing blowing the label out.
 *   4. It zooms itself toward a small object rather than asking anybody to walk
 *      into a shelf.
 *   5. Only then does it say one sentence, gated on a measurement, in
 *      `framing.ts`.
 */

import { BarcodeScanner, type StableRead } from './barcode.ts';
import { BarcodeVote, type VoteBox } from './votes.ts';
import { decideTorch, normaliseTorchSetting, type TorchSetting } from './torch.ts';
import {
  ObjectDetector,
  salientBox,
  mergeDetections,
  centreFallback,
  type Detection,
  type Box,
} from './detector.ts';
import { StabilityGate, sharpnessOf, burst, releaseAllBut, cropTo, type CropResult } from './capture.ts';
import { Coach, glareIn, zoomFor, type CoachKey } from './framing.ts';

/** One barcode in view, in source frame coordinates. */
export interface BarcodeMark {
  readonly value: string;
  readonly box: VoteBox;
  /** Frames of the window that saw it, out of `total`. */
  readonly frames: number;
  readonly total: number;
  /** The one the button will send. Drawn differently. */
  readonly focused: boolean;
  /** Focused and holding a majority: the button is showing for this one. */
  readonly confirmed: boolean;
}

export interface CameraEvents {
  /** The button was pressed and here are the digits. Fires only from `scanBarcode()`. */
  onBarcode(read: StableRead): void;
  /** Boxes to draw, the one that would be captured first. Called often; keep the handler cheap. */
  onBoxes(boxes: Detection[], frameWidth: number, frameHeight: number): void;
  /** The shutter fired, by itself or by hand, and here is the crop. */
  onCapture(crop: CropResult, detection: Detection): void;
  /** Torch state changed, so the toggle can reflect what actually happened. */
  onTorch?(on: boolean): void;
  /** Something the user should be told, in their words, not ours. */
  onTrouble?(message: string): void;
  /**
   * Every barcode in view right now, the focused one first. Empty when there is
   * none. Fires only on a change, so it can drive the DOM directly.
   */
  onBarcodes?(marks: BarcodeMark[], frameWidth: number, frameHeight: number): void;
  /**
   * The vote has a winner (a majority of the recent frames agree) or has lost
   * it. Fires only when that changes. The screen shows its button for a
   * non-null value and hides it for null; nothing is sent until it is pressed.
   */
  onBarcodeReady?(ready: StableRead | null): void;
  /**
   * The one coaching line the frame has earned, or null for silence. Fires only
   * on a change. See `framing.ts` for why these four and not the obvious ones.
   */
  onCoach?(key: CoachKey | null): void;
}

export interface CameraOptions {
  readonly video: HTMLVideoElement;
  readonly events: CameraEvents;
  readonly wasmUrl?: string;
  readonly mediapipeWasmBase?: string;
  readonly detectorModelUrl?: string;
  /** Off for users who would rather press the button themselves. */
  readonly autoCapture?: boolean;
  /** The camera closing the distance itself instead of asking. On unless told otherwise. */
  readonly autoZoom?: boolean;
  /** The user's torch setting (torch.ts). Absent means auto at Shin's default threshold. */
  readonly torch?: { mode?: unknown; threshold?: unknown };
  /** Decode barcodes from the first frame. Off means photo mode. On unless told otherwise. */
  readonly barcodeMode?: boolean;
}

const DETECT_EVERY_MS = 180;

/**
 * How long a small object has to sit still before the camera zooms toward it.
 *
 * Long enough that a sweep across a shelf does not drag the lens along behind
 * it, short enough that somebody who has stopped and aimed gets the help while
 * they are still aiming.
 */
const ZOOM_DWELL_MS = 900;
/** Minimum gap between zoom changes. A lens that keeps adjusting reads as a fault. */
const ZOOM_COOLDOWN_MS = 1200;

/**
 * How long a tapped object stays chosen once the detectors stop finding it.
 *
 * A pick has to survive a hand tremor and a frame or two of the detector losing
 * the object, or tapping would feel like it did not take. It must not survive
 * the user turning to a different shelf, which is what the re-association by
 * overlap below is for.
 */
const PICK_GRACE_MS = 1600;
/** How much a new detection has to overlap the picked box to count as the same thing. */
const PICK_IOU = 0.3;

export class Camera {
  readonly #video: HTMLVideoElement;
  readonly #events: CameraEvents;
  readonly #scanner: BarcodeScanner;
  readonly #detector: ObjectDetector | null;
  readonly #gate = new StabilityGate();
  readonly #coach = new Coach();
  readonly #autoCapture: boolean;
  readonly #autoZoom: boolean;

  #stream: MediaStream | null = null;
  #running = false;
  #lastDetect = 0;
  #boxes: Detection[] = [];
  #darkSince: number | null = null;
  #torchOn = false;
  #capturing = false;
  #scanCanvas: OffscreenCanvas | null = null;
  /** Source pixels per scan-frame pixel, so a barcode box can be reported in source space. */
  #scanScale = 1;

  #pinned: Box | null = null;
  #pinnedAt = 0;

  #zoomCaps: { min: number; max: number; step: number } | null = null;
  #zoom = 1;
  #zoomAt = 0;
  #smallSince: number | null = null;

  #lastCoach: CoachKey | null = null;
  #lastCodeKey = '';
  #lastReady = '';
  /** Set when the torch itself is what is blowing the label out, so it is not re-lit into the same glare. */
  #torchBlocked = false;
  #torchSetting: TorchSetting;
  /** The frame has stayed darker than the threshold and the app is not the one lighting it. */
  #tooDark = false;
  /**
   * The vote over the last second or two of frames (votes.ts). Fed by every
   * decode pass while `#decoding`, read by `#emitBarcodes` and by the press.
   */
  readonly #vote = new BarcodeVote();
  /**
   * Whether frames are handed to zxing at all: true in barcode mode, false in
   * photo mode, where the decoder is never run. Not a gate on RESULTS: a code
   * in view is tracked and drawn regardless, and nothing is sent until the
   * screen's button calls `scanBarcode()`.
   */
  #decoding: boolean;

  constructor(options: CameraOptions) {
    this.#video = options.video;
    this.#events = options.events;
    this.#autoCapture = options.autoCapture ?? true;
    this.#autoZoom = options.autoZoom ?? true;
    this.#decoding = options.barcodeMode ?? true;
    this.#torchSetting = normaliseTorchSetting(options.torch);
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
    this.#readZoomCapability();

    // Warmed before the first frame rather than on it: a module load during the
    // first second reads as the camera being broken (decision 1).
    void this.#scanner.warm();
    void this.#detector?.load();

    this.#running = true;
    this.#loop();
  }

  stop(): void {
    this.#running = false;
    // Frames from this visit must not vote in the next one.
    this.#vote.reset();
    this.#gate.reset();
    this.#coach.reset();
    // Zoom is a property of the track, and the track is about to be stopped, so
    // this is belt and braces rather than necessary. It matters on the browsers
    // that hand the same track back on a fast re-entry to the screen.
    void this.#applyZoom(this.#zoomCaps?.min ?? 1);
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = null;
  }

  /** The manual shutter. Always available; decision 6 keeps it as the override. */
  async capture(): Promise<void> {
    await this.#doCapture();
  }

  /**
   * The user tapped one of the boxes. Decision 9's tap, from the outside.
   *
   * Takes an index into the array last handed to `onBoxes` rather than a box,
   * so the screen never has to hold geometry it does not otherwise care about.
   * The pick is stored as geometry, not as an index, because the next detection
   * pass re-sorts by score and an index would silently come to mean a different
   * object.
   */
  select(index: number): void {
    const chosen = this.#boxes[index];
    if (!chosen) return;
    this.#pinned = chosen.box;
    this.#pinnedAt = Date.now();
    // The pick is a statement about what the user meant, so it takes effect on
    // screen now rather than at the next detection tick up to 180ms away.
    this.#boxes = orderByPin(this.#boxes, this.#pinned);
    this.#events.onBoxes(this.#boxes, this.#video.videoWidth, this.#video.videoHeight);
    this.#gate.reset();
  }

  /**
   * The button was pressed: send the digits of the code the vote has settled
   * on. The only thing in the eye that ever emits `onBarcode`.
   *
   * Returns false when there is no confirmed code (the button should not have
   * been showing, or the code left the frame in the last few milliseconds), and
   * then sends nothing. The digits only: the event carries the value, format and
   * where it sat, and no image.
   */
  scanBarcode(): boolean {
    const won = this.#vote.confirmed(Date.now());
    if (!won) return false;
    const read: StableRead = {
      value: won.value,
      format: won.format,
      box: won.box ? this.#toSource(won.box) : null,
      frames: won.frames,
    };
    // One press, one read, and the code still in frame must not offer the
    // button again until it has genuinely been voted for afresh.
    this.#vote.reset();
    this.#emitBarcodes();
    this.#emitCoach(null);
    this.#events.onBarcode(read);
    return true;
  }

  /** Photo mode passes false: zxing is then never handed a frame. Barcode mode passes true. */
  setBarcodeMode(on: boolean): void {
    if (on === this.#decoding) return;
    this.#decoding = on;
    this.#vote.reset();
    this.#emitBarcodes();
  }

  /** A new torch setting, live. The screen normally passes it at construction. */
  setTorchSetting(setting: { mode?: unknown; threshold?: unknown }): void {
    this.#torchSetting = normaliseTorchSetting(setting);
    this.#darkSince = null;
    this.#tooDark = false;
  }

  /** Drops a pick. For leaving the screen or coming back to idle, not for frames. */
  clearSelection(): void {
    this.#pinned = null;
    this.#coach.silence();
    // Coming back to idle starts the vote over, so the button that was showing
    // for the code just answered is not sitting there for the next visit.
    this.#vote.reset();
    this.#emitBarcodes();
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

  #readZoomCapability(): void {
    const track = this.#stream?.getVideoTracks()[0];
    const caps = (track as unknown as { getCapabilities?: () => { zoom?: { min: number; max: number; step: number } } })
      ?.getCapabilities?.();
    const zoom = caps?.zoom;
    // Absent on desktop, on Safari, and on plenty of Android browsers. Absence
    // is the ordinary case, and it is what makes the "step closer" line able to
    // fire at all: the camera only asks once it cannot do it itself.
    if (!zoom || !(zoom.max > zoom.min)) return;
    this.#zoomCaps = { min: zoom.min, max: zoom.max, step: zoom.step || 0.1 };
    this.#zoom = zoom.min;
  }

  async #applyZoom(next: number): Promise<void> {
    const track = this.#stream?.getVideoTracks()[0];
    if (!track || !this.#zoomCaps) return;
    if (Math.abs(next - this.#zoom) < this.#zoomCaps.step) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: next } as unknown as MediaTrackConstraintSet] });
      this.#zoom = next;
      this.#zoomAt = Date.now();
    } catch {
      // Reported as capable and refused anyway, which happens. Stop offering it
      // so the coach line becomes available instead of the camera silently
      // doing nothing on every tick.
      this.#zoomCaps = null;
    }
  }

  /** Whether there is still zoom to spend on getting closer to the current box. */
  #zoomLeft(): boolean {
    if (!this.#zoomCaps) return false;
    return this.#zoom < Math.min(this.#zoomCaps.max, this.#zoomCaps.min * 4) - this.#zoomCaps.step;
  }

  #frameToImageData(): ImageData | null {
    const w = this.#video.videoWidth;
    const h = this.#video.videoHeight;
    if (w === 0 || h === 0) return null;
    // Barcodes decode fine at 960 wide and it is four times less work than 1920.
    const scale = Math.min(1, 960 / w);
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    this.#scanScale = w / Math.max(cw, 1);
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

    /*
     * EVERY FRAME, 2026-09-17. In barcode mode each frame is decoded and the
     * result goes into the vote, whether or not it found anything (an empty
     * frame counts against a code that only appears on some of them). Nothing
     * here emits a read: the marks and the "ready" signal are all this loop can
     * say, and only the button's `scanBarcode()` sends digits onward. In photo
     * mode zxing is not run at all.
     */
    if (this.#decoding) {
      const seen = await this.#scanner.read(frame);
      // Null is a frame that was never decoded (module loading or wedged), which
      // says nothing about what is in view, so it does not vote.
      if (seen) this.#vote.push(Date.now(), seen);
    }
    this.#emitBarcodes();

    this.#checkLight(frame);

    const now = performance.now();
    if (now - this.#lastDetect >= DETECT_EVERY_MS) {
      this.#lastDetect = now;
      const sw = this.#video.videoWidth;
      const sh = this.#video.videoHeight;
      const classes = this.#detector?.detect(this.#video, now) ?? [];
      const salient = salientBox(this.#video, sw, sh);
      const merged = mergeDetections(classes, salient ? [salient] : []);
      const found = merged.length > 0 ? merged : [centreFallback(sw, sh)];
      this.#boxes = orderByPin(found, this.#livePin(found));
      this.#events.onBoxes(this.#boxes, sw, sh);

      const target = this.#boxes[0];
      const glare = glareIn(frame, target.box, sw);
      this.#considerTorchGlare(glare);
      this.#considerZoom(target.box, sw, sh);

      const focus = this.#decoding ? this.#vote.focus(Date.now()) : null;
      const focusBox = focus?.box ? this.#toSource(focus.box) : null;
      this.#emitCoach(
        this.#coach.update(
          {
            // What `cropTo` will actually send, pad included, in source pixels.
            cropWidth: target.box.width * 1.16,
            glare,
            choices: merged.length,
            codeFrames: focus?.frames ?? 0,
            codeConfirmed: focus?.confirmed ?? false,
            codeOffset: focusBox
              ? {
                  dx: (focusBox.x + focusBox.width / 2) / Math.max(sw, 1) - 0.5,
                  dy: (focusBox.y + focusBox.height / 2) / Math.max(sh, 1) - 0.5,
                }
              : undefined,
            tooDark: this.#tooDark,
            canZoom: this.#zoomLeft(),
          },
          Date.now(),
        ),
      );

      if (this.#autoCapture && merged.length === 1) {
        // Decision 9: never auto-fire when there is more than one thing it could
        // be. Two boxes means the user taps, and the gate is held open.
        const sharp = sharpnessOf(frame);
        if (this.#gate.update(target.box, sharp, sw)) {
          await this.#doCapture();
        }
      } else {
        this.#gate.reset();
      }
    }
  }

  /** The pick, if the detectors are still finding the thing that was picked. */
  #livePin(found: Detection[]): Box | null {
    if (!this.#pinned) return null;
    const again = found.find((d) => iou(d.box, this.#pinned!) > PICK_IOU);
    if (again) {
      // Follow it. A picked jar that the user drifts across the frame is still
      // the picked jar, and re-associating by overlap is what keeps it that way
      // without the pick being an index that quietly comes to mean a neighbour.
      this.#pinned = again.box;
      this.#pinnedAt = Date.now();
      return this.#pinned;
    }
    if (Date.now() - this.#pinnedAt > PICK_GRACE_MS) {
      this.#pinned = null;
      return null;
    }
    return this.#pinned;
  }

  #emitCoach(key: CoachKey | null): void {
    if (key === this.#lastCoach) return;
    this.#lastCoach = key;
    this.#events.onCoach?.(key);
  }

  /** A box read off the downscaled scan frame, in source video pixels. */
  #toSource(box: VoteBox): VoteBox {
    const k = this.#scanScale;
    return { x: box.x * k, y: box.y * k, width: box.width * k, height: box.height * k };
  }

  /**
   * Tells the screen what the vote looks like now: every code in view (item 8)
   * and whether one of them has earned the button (item 7). Both are keyed on a
   * coarse fingerprint so the DOM is only touched on a change.
   *
   * The key rounds each box to whole percent of the frame: a mark that
   * repaints on sub-pixel drift jitters, and a jittering mark on a barcode
   * reads as a failing read rather than a working one.
   */
  #emitBarcodes(): void {
    const w = Math.max(this.#video.videoWidth, 1);
    const now = Date.now();
    const tracks = this.#decoding ? this.#vote.tracks(now) : [];
    const marks: BarcodeMark[] = [];
    for (const t of tracks) {
      if (!t.box) continue;
      marks.push({
        value: t.value,
        box: this.#toSource(t.box),
        frames: t.frames,
        total: t.total,
        focused: t.focused,
        confirmed: t.confirmed,
      });
    }
    const key = marks
      .map(
        (m) =>
          `${m.value}:${m.focused ? 'f' : 'o'}${m.confirmed ? 'c' : ''}:${Math.round((m.box.x / w) * 100)},${Math.round((m.box.y / w) * 100)},${Math.round((m.box.width / w) * 100)}`,
      )
      .join('|');
    if (key !== this.#lastCodeKey) {
      this.#lastCodeKey = key;
      this.#events.onBarcodes?.(marks, this.#video.videoWidth, this.#video.videoHeight);
    }

    const won = tracks.find((t) => t.confirmed) ?? null;
    const readyKey = won ? won.value : '';
    if (readyKey !== this.#lastReady) {
      this.#lastReady = readyKey;
      this.#events.onBarcodeReady?.(
        won
          ? { value: won.value, format: won.format, box: won.box ? this.#toSource(won.box) : null, frames: won.frames }
          : null,
      );
    }
  }

  /**
   * The torch, and the case where the torch is the problem.
   *
   * A torch fired at a shrink wrapped package or a freezer door comes straight
   * back and takes the label with it, and the user reads that as the app having
   * broken the picture it just fixed. So a blown box while the torch is on puts
   * the torch back out and keeps it out for this session. The coach line for
   * glare still fires afterwards if the ambient light is doing it too, which is
   * the case the user can actually fix by moving.
   */
  #considerTorchGlare(glare: number): void {
    if (!this.#torchOn || glare < 0.2) return;
    this.#torchBlocked = true;
    void this.setTorch(false);
  }

  #considerZoom(box: Box, sw: number, sh: number): void {
    if (!this.#autoZoom || !this.#zoomCaps || this.#capturing) return;
    const now = Date.now();
    if (now - this.#zoomAt < ZOOM_COOLDOWN_MS) return;
    const next = zoomFor(this.#zoom, box, sw, sh, this.#zoomCaps);
    if (next === this.#zoom) {
      this.#smallSince = null;
      return;
    }
    // Zooming out to recover a box that has grown past the frame is immediate:
    // the user has walked in and the shot is being lost right now. Zooming in
    // waits, so a sweep along a shelf does not drag the lens with it.
    if (next > this.#zoom) {
      this.#smallSince ??= now;
      if (now - this.#smallSince < ZOOM_DWELL_MS) return;
    }
    this.#smallSince = null;
    void this.#applyZoom(next);
  }

  #checkLight(frame: ImageData): void {
    let sum = 0;
    const d = frame.data;
    // Every 64th pixel: mean luminance does not need all two million of them.
    for (let i = 0; i < d.length; i += 256) {
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const mean = sum / (d.length / 256);

    // The decision is torch.ts's, and it is the user's setting (2026-09-17):
    // auto lights the shelf below their threshold, off never touches the
    // hardware and instead sets `#tooDark`, which the coach turns into a line.
    const decision = decideTorch({
      setting: this.#torchSetting,
      mean,
      now: Date.now(),
      darkSince: this.#darkSince,
      torchOn: this.#torchOn,
      blocked: this.#torchBlocked,
    });
    this.#darkSince = decision.darkSince;
    this.#tooDark = decision.tooDark;
    if (decision.action === 'on') void this.setTorch(true);
    else if (decision.action === 'off') void this.setTorch(false);
  }

  async #doCapture(): Promise<void> {
    if (this.#capturing) return;
    this.#capturing = true;
    this.#gate.reset();
    this.#coach.silence();
    this.#emitCoach(null);
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

/**
 * Puts the picked object first, everything else behind it in the order the
 * detectors ranked them.
 *
 * First is not a cosmetic position. It is the box the reticle draws, the box
 * the crop is taken from, and the box the stability gate watches, so a pick has
 * to move the object to the front of this array or it would be a highlight that
 * changes nothing about the photograph taken.
 */
function orderByPin(found: Detection[], pin: Box | null): Detection[] {
  if (!pin) return found;
  const i = found.findIndex((d) => iou(d.box, pin) > PICK_IOU);
  if (i <= 0) return found;
  const copy = found.slice();
  const [picked] = copy.splice(i, 1);
  return [picked, ...copy];
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
