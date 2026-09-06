/**
 * Whether the shot is good enough, and what the one thing to say about it is.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE. The OLMA audit found four separate
 * surfaces teaching the same five photography rules, all of them shown before
 * anything had gone wrong, and none of them attached to a failure the user was
 * actually having (rows 14, 31, 32, 87). Instructions delivered before the
 * problem teach nothing, because none of it has happened yet. So nothing in
 * here ever speaks on a timer or on arrival. A line is produced only when a
 * measurement taken from the live frame says this specific thing is wrong right
 * now, and every line names one action.
 *
 * THE SECOND RULE. The app moves before the user does. A coach line is the last
 * resort, not the first: if the app can fix the framing itself (it can zoom, it
 * can light the shelf, it can pick the object out of the shelf and crop to it)
 * then it does that and says nothing. `camera.ts` only asks this file for a
 * line once its own moves are exhausted, which is why `tooFar` takes a
 * `canZoom` and goes quiet while there is zoom left to spend.
 *
 * WHY THESE FOUR AND NOT THE OBVIOUS ONES.
 *
 *   "Move back / zoom out" is not here. In an aisle the failure is almost
 *   always the opposite: the thing is on a shelf an arm and a half away and its
 *   label lands on a couple of hundred pixels. Too close is rare, and when it
 *   does happen the fix belongs to the camera, not to a person holding a basket.
 *
 *   "The lighting is bad" is not here. The user can see that it is dark, cannot
 *   change a supermarket's lights, and the torch already comes on by itself.
 *   Telling somebody a fact they can see and cannot act on is noise. What
 *   replaces it is glare, which is the light failure that IS fixable in one
 *   movement: a freezer door, a shrink wrapped label, or our own torch bouncing
 *   straight back. That is measured here as clipped pixels inside the box.
 *
 *   "Bad angle" is not here as a general test. There is no cheap measurement of
 *   angle for arbitrary packaging, and a photograph of a cereal box taken from
 *   thirty degrees off reads perfectly well. Angle only actually breaks one
 *   thing, a barcode, and that case is covered exactly: when a code is decoding
 *   but has not agreed with itself enough times, the line is to hold it there.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The four things the live frame can be asked about. All measured, none guessed. */
export interface FrameSignals {
  /** Width in source pixels of the crop that would be sent right now. */
  readonly cropWidth: number;
  /** Fraction of the box that is clipped to white. 0 to 1. */
  readonly glare: number;
  /** How many separate things the detectors are currently offering. */
  readonly choices: number;
  /** Frames a barcode has agreed with itself, out of the number needed. */
  readonly codeFrames: number;
  /** Whether the camera still has zoom left to spend on getting closer. */
  readonly canZoom: boolean;
}

export type CoachKey = 'hold' | 'glare' | 'closer' | 'pick';

/**
 * Below this many source pixels across, the crop no longer carries the fine
 * print, and the fine print is the identity: "unsweetened", "no salt added",
 * "375 g" against "750 g". Set from the crop path rather than from a guess.
 * `cropTo` never upscales, so a 200px box is sent as a 200px picture and the
 * model is reading a thumbnail. 360 is the width at which a normal front-of-pack
 * ingredient qualifier is still legible at 1080p capture.
 */
export const MIN_CROP_PX = 360;

/**
 * Fraction of the box that has to be clipped white before glare is called.
 *
 * Not zero, because a specular highlight on a curved bottle is normal and
 * harmless. Eight percent is a blown region large enough to be sitting on top
 * of the label rather than beside it.
 */
export const GLARE_FRACTION = 0.08;

/** Luma at which a pixel has lost its information rather than merely being bright. */
const CLIPPED = 246;

/**
 * Fraction of the pixels inside a box that are clipped white.
 *
 * Takes the already downscaled scan frame rather than the video, because the
 * loop has one in hand every tick and reading the video again costs a second
 * draw for a number that does not need the resolution. Structural typing on the
 * pixel source rather than `ImageData` so this is testable without a canvas.
 */
export function glareIn(
  frame: { data: Uint8ClampedArray; width: number; height: number },
  box: Box,
  sourceWidth: number,
): number {
  const scale = frame.width / Math.max(sourceWidth, 1);
  const x0 = Math.max(0, Math.floor(box.x * scale));
  const y0 = Math.max(0, Math.floor(box.y * scale));
  const x1 = Math.min(frame.width, Math.ceil((box.x + box.width) * scale));
  const y1 = Math.min(frame.height, Math.ceil((box.y + box.height) * scale));
  if (x1 <= x0 || y1 <= y0) return 0;

  let clipped = 0;
  let seen = 0;
  // Every second pixel in both directions. A blown region is contiguous and
  // large by definition, so quarter sampling cannot miss one.
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const p = (y * frame.width + x) * 4;
      const luma = 0.299 * frame.data[p] + 0.587 * frame.data[p + 1] + 0.114 * frame.data[p + 2];
      if (luma >= CLIPPED) clipped += 1;
      seen += 1;
    }
  }
  return seen === 0 ? 0 : clipped / seen;
}

/**
 * The one thing worth saying about this frame, or nothing.
 *
 * Ordered by what ends the session soonest and cheapest. A barcode that is
 * halfway to agreeing is worth more than every other line put together: it
 * resolves in a millisecond, it is exact rather than a model's opinion, and it
 * costs the user none of their weekly image searches. So it speaks first, and
 * everything else is silent while it is in progress.
 */
export function chooseCoach(s: FrameSignals): CoachKey | null {
  if (s.codeFrames > 0) return 'hold';
  if (s.glare >= GLARE_FRACTION) return 'glare';
  if (s.cropWidth > 0 && s.cropWidth < MIN_CROP_PX && !s.canZoom) return 'closer';
  if (s.choices > 1) return 'pick';
  return null;
}

/** How long a condition has to hold before it is allowed to speak. */
const ARM_MS = 850;
/** How long it has to be gone before the line comes down. */
const CLEAR_MS = 900;
/** Once shown, a line stays at least this long, so nothing flickers past reading speed. */
const MIN_SHOW_MS = 1800;

/**
 * The gate between a measurement and a sentence.
 *
 * Raw `chooseCoach` flips several times a second, because a hand holding a
 * phone moves and a box redrawn five times a second moves with it. A line that
 * appears and vanishes faster than it can be read is worse than no line: it
 * reads as the app being unsure, which is exactly the impression this whole
 * system exists to remove. So a condition has to persist to earn the line, and
 * the line has to persist to keep the surface still.
 *
 * `pick` is capped at one appearance per camera session on purpose. It is the
 * only line here that teaches a control rather than fixing a shot, and a
 * control only needs teaching once. After that the second box on screen is its
 * own instruction.
 */
export class Coach {
  #candidate: CoachKey | null = null;
  #candidateSince = 0;
  #showing: CoachKey | null = null;
  #shownAt = 0;
  #clearSince = 0;
  #pickSpent = false;

  /**
   * Returns the line that should be on screen now, or null for silence.
   *
   * Idempotent per tick: the caller compares it to what it painted last and
   * only touches the DOM on a change.
   */
  update(signals: FrameSignals, now: number): CoachKey | null {
    let wanted = chooseCoach(signals);
    if (wanted === 'pick' && this.#pickSpent) wanted = null;

    if (wanted !== this.#candidate) {
      this.#candidate = wanted;
      this.#candidateSince = now;
    }

    if (this.#showing) {
      if (wanted === this.#showing) {
        this.#clearSince = 0;
        return this.#showing;
      }
      if (this.#clearSince === 0) this.#clearSince = now;
      const held = now - this.#shownAt >= MIN_SHOW_MS;
      const gone = now - this.#clearSince >= CLEAR_MS;
      if (!held || !gone) return this.#showing;
      this.#showing = null;
      this.#clearSince = 0;
    }

    if (wanted && now - this.#candidateSince >= ARM_MS) {
      this.#showing = wanted;
      this.#shownAt = now;
      this.#clearSince = 0;
      if (wanted === 'pick') this.#pickSpent = true;
      return wanted;
    }
    return null;
  }

  /** Drops the current line without waiting out its minimum. For state changes, not for frames. */
  silence(): void {
    this.#showing = null;
    this.#candidate = null;
    this.#clearSince = 0;
  }

  reset(): void {
    this.silence();
    this.#pickSpent = false;
  }
}

/**
 * How much to zoom so a small object fills a useful part of the frame.
 *
 * Returns the current factor unchanged when there is nothing to gain, so the
 * caller can compare and skip the constraint call. The target is 55 percent of
 * the frame's short side rather than the whole frame: a box cropped hard to its
 * own edges loses the packaging context that tells a model a jar is a jar, and
 * a zoom that overshoots costs a second correction the user watches happen.
 */
export function zoomFor(
  current: number,
  box: Box,
  frameWidth: number,
  frameHeight: number,
  caps: { min: number; max: number },
): number {
  const shortSide = Math.min(frameWidth, frameHeight);
  const boxShort = Math.max(1, Math.min(box.width, box.height));
  const ratio = (shortSide * 0.55) / boxShort;
  // Deadband. Under a tenth of a stop either way is not worth a visible change
  // of frame, and a camera that keeps nudging its own zoom looks broken.
  if (ratio > 0.9 && ratio < 1.25) return current;
  // Never more than four times the widest the lens goes. Past that a phone is
  // upscaling, which buys pixels and no detail, and the crop is better served
  // by the user taking one step.
  const ceiling = Math.min(caps.max, caps.min * 4);
  return Math.min(ceiling, Math.max(caps.min, current * ratio));
}
