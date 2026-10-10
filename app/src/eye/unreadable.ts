/**
 * A barcode the camera keeps seeing but cannot read. D-232.
 *
 * zxing never hands back an EAN-13 whose check digit fails as a reading, so a
 * damaged grocery barcode never reached the vote, never showed the button and
 * never started the misread wait: the camera kept aiming with nothing said
 * (RULINGS.md "A scan never ends with no result"). The reader now reports what
 * it located and could not read (`BarcodeScanner.lastUnreadable`), and this
 * watch turns a sustained run of it into ONE signal, so the screen can say so
 * plainly and offer typing the name.
 *
 * WHEN IT SPEAKS. After `afterMs` of frames that held an unreadable barcode
 * and no good one, with at least `minFrames` of them, gaps of up to `gapMs`
 * forgiven (the code drifts in and out of focus while the hand moves). Once
 * per run: it says nothing more until a good read or a longer gap ends the run.
 * A good read on any frame ends the run at once.
 *
 * `afterMs` is a guess, untested in an aisle: two seconds is long enough for
 * the ordinary first frames of a good barcode to come good, and short enough
 * that the shopper hears something well before they give up.
 *
 * Pure: no DOM, no clock of its own (every call takes `now`), no zxing.
 */
import type { Sighting } from './votes.ts';

export interface UnreadableOptions {
  /** How long the barcode must stay in view, unread, before the watch speaks. */
  readonly afterMs?: number;
  /** Fewest unreadable frames in that run. */
  readonly minFrames?: number;
  /** A gap with no unreadable barcode longer than this ends the run. */
  readonly gapMs?: number;
}

export const UNREADABLE_DEFAULTS = {
  afterMs: 2000,
  minFrames: 5,
  gapMs: 800,
} as const;

/** What the watch reports: the most often seen digits (possibly empty), and how many frames saw it. */
export interface UnreadableRead extends Sighting {
  readonly frames: number;
}

export class UnreadableWatch {
  readonly #opts: Required<UnreadableOptions>;
  #since = -1;
  #lastSeen = -1;
  #frames = 0;
  #fired = false;
  readonly #counts = new Map<string, { sighting: Sighting; n: number }>();

  constructor(options: UnreadableOptions = {}) {
    this.#opts = { ...UNREADABLE_DEFAULTS, ...options };
  }

  /** Forget the run: a good read, a sheet over the camera, or the camera going away. */
  reset(): void {
    this.#since = -1;
    this.#lastSeen = -1;
    this.#frames = 0;
    this.#fired = false;
    this.#counts.clear();
  }

  /**
   * One decoded frame: how many good readings it gave, and what it saw and
   * could not read. Returns the read to report the one time the run earns it,
   * otherwise null.
   */
  push(now: number, decoded: number, unreadable: readonly Sighting[]): UnreadableRead | null {
    if (decoded > 0) {
      this.reset();
      return null;
    }
    const running = this.#since >= 0 && now - this.#lastSeen <= this.#opts.gapMs;
    if (unreadable.length === 0) {
      if (this.#since >= 0 && !running) this.reset();
      return null;
    }
    if (!running) {
      this.reset();
      this.#since = now;
    }
    this.#lastSeen = now;
    this.#frames += 1;
    for (const s of unreadable) {
      const had = this.#counts.get(s.value);
      this.#counts.set(s.value, { sighting: s, n: (had?.n ?? 0) + 1 });
    }
    if (this.#fired || this.#frames < this.#opts.minFrames || now - this.#since < this.#opts.afterMs) return null;
    this.#fired = true;
    let best: { sighting: Sighting; n: number } | null = null;
    for (const c of this.#counts.values()) {
      // Digits beat none: an empty read is a barcode zxing could not even spell.
      const better = !best || (c.sighting.value !== '' && best.sighting.value === '') || (c.n > best.n && (c.sighting.value !== '') === (best.sighting.value !== ''));
      if (better) best = c;
    }
    return { ...best!.sighting, frames: this.#frames };
  }
}
