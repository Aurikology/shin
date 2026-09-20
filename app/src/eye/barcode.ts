/**
 * Barcode reading. Decisions 2, 3, 4 and 15.
 *
 * WHY THIS IS NOT `BarcodeDetector`. The browser has a built-in barcode reader
 * and using it would delete this whole file. It is not implemented in WebKit, so
 * it does not exist in any browser on iPhone or iPad, and the failure is silent:
 * the constructor is simply undefined, a feature check falls through, and the
 * scanner does nothing for half the users while reporting no error at all. That
 * is decision 2, and it is the reason a WebAssembly build runs on every platform
 * instead of only where the native path is missing.
 *
 * WHY EVERY RETAIL SYMBOLOGY. Decision 3. EAN-13 and UPC-A cover packaged goods
 * and nothing else. GS1 DataBar is what is printed on loose produce, deli
 * scale labels and small items where a full EAN will not fit, and it is exactly
 * the aisle where a shopper most wants a second opinion on the price. Shipping
 * EAN-only would have meant the produce section silently never scanning, which
 * looks identical to a camera that is not working.
 *
 * WHY A VOTE BEFORE THE BUTTON. A single frame can decode a barcode from a
 * neighbouring product on the shelf as the camera sweeps past. This file only
 * reads frames (`read`); `votes.ts` asks for the same value on a majority of
 * the last second or two before the "Scan barcode" button is allowed to show,
 * and the press, never the decode, is what sends anything anywhere (2026-09-17).
 */

import { readBarcodes, prepareZXingModule, type ReadResult } from 'zxing-wasm/reader';
import type { Sighting } from './votes.ts';

/**
 * Every symbology a shopper can point a phone at in a Canadian shop.
 *
 * Listed one by one rather than as the "AllRetail" group: the group leaves out
 * ITF-14 and Code 128, which are on case packs and on the deli and bakery labels
 * that stores print themselves, and those are real products on real shelves.
 */
/**
 * How long one decode is allowed to take before the reader is treated as gone.
 *
 * Not a performance budget. A real decode of a 960px frame is about 45ms, so
 * nothing that is still working comes near this. It is the line past which a
 * promise is assumed never to settle, which is what an aborted WebAssembly
 * module produces. See `scan`.
 */
const DECODE_CEILING_MS = 1500;
/**
 * How many consecutive never-settling decodes declare the module dead. D-128.
 *
 * Three, and the number is a trade stated rather than tuned: a dead module
 * leaks one unsettled promise per attempt, so this is the ceiling on that
 * leak, while one or two slow frames on a cold phone no longer end scanning
 * for the visit.
 */
const WEDGE_STRIKES = 3;

export const RETAIL_FORMATS = [
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
  'ITF',
  'ITF14',
  'Code128',
  'Code39',
  'Code93',
  'Codabar',
  'DataBar',
  'DataBarOmni',
  'DataBarStk',
  'DataBarStkOmni',
  'DataBarLtd',
  'DataBarExp',
  'DataBarExpStk',
  'QRCode',
  'DataMatrix',
] as const;

export interface Reading {
  /** Digits as printed. GS1 application identifiers are already stripped. */
  readonly value: string;
  readonly format: string;
  /** Where it sat in the frame, so the UI can point at what it locked onto. */
  readonly box: { x: number; y: number; width: number; height: number } | null;
}

export interface StableRead extends Reading {
  /** How many frames of the vote window agreed when the button was pressed. */
  readonly frames: number;
}

/**
 * A GS1 DataBar carries application identifiers around the number; a shelf
 * lookup wants the GTIN alone. (01) is the GTIN AI, and its value is 14 digits.
 */
function extractGtin(text: string, format: string): string {
  if (!format.startsWith('DataBar')) return text.trim();
  const m = /\(?01\)?(\d{14})/.exec(text);
  if (m) return m[1];
  return text.replace(/[^\d]/g, '');
}

/** A frame's raw bytes, typed loosely so this can be tested with no DOM at all. */
export interface RawFrame {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * Grayscale plus a linear contrast stretch. Item 12's own preprocessing,
 * tried only on the second, slower decode attempt: a shelf barcode is often
 * photographed under uneven light, and none of zxing's own options
 * (`tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale`, `tryDenoise`) touch
 * contrast at all.
 *
 * Grayscale reuses Rec. 601 luma, the same weights `capture.ts`'s `toGrey`
 * uses, so a red label and a green one are not preprocessed to different
 * effective contrast for no reason a shopper would recognise. The stretch
 * maps the frame's OWN min-max range to 0-255 rather than a fixed formula, so
 * a photo that is already high contrast is left almost alone and a flat,
 * washed-out one gets the most correction.
 */
export function grayscaleContrast(frame: RawFrame): RawFrame {
  const { data, width, height } = frame;
  const n = width * height;
  const luma = new Float32Array(n);
  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const g = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    luma[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = max - min;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    // A flat frame (min === max) has nothing to stretch; leave it as the
    // plain grayscale rather than dividing by zero into a blank image.
    const v = range > 0 ? Math.round(((luma[i] - min) / range) * 255) : luma[i];
    out[p] = v;
    out[p + 1] = v;
    out[p + 2] = v;
    out[p + 3] = 255;
  }
  return { data: out, width, height };
}

/**
 * Consecutive empty decodes before the slower, preprocessed retry runs, and
 * how often it repeats: the counter resets the moment it fires (win or lose),
 * so preprocessing runs on at most one frame in `PREPROCESS_AFTER_MISSES + 1`
 * rather than on every frame from the first streak onward.
 *
 * Not measured. `votes.ts`'s own majority window wants five frames minimum
 * before anything is confirmed (`VOTE_DEFAULTS.minFrames`); this reuses that
 * number as the closest local anchor for "long enough to be worth the extra
 * decode cost" that does not need a phone to pick.
 */
export const PREPROCESS_AFTER_MISSES = 5;

/** Whether the miss streak has earned the slower, preprocessed retry. */
export function shouldRetryWithPreprocessing(consecutiveMisses: number, threshold = PREPROCESS_AFTER_MISSES): boolean {
  return consecutiveMisses >= threshold;
}

export interface ScannerOptions {
  /** Where the .wasm sits when served. */
  readonly wasmUrl?: string;
}

export class BarcodeScanner {
  #ready: Promise<unknown> | null = null;
  /** Set when the reader stopped answering at all. See `scan`. */
  #wedged = false;
  /**
   * Consecutive decodes that hit the ceiling without ever settling. D-128.
   *
   * ONE SLOW DECODE IS NOT A DEAD MODULE, and this used to treat them as the
   * same thing: the first timeout latched `#wedged`, nothing ever cleared it,
   * and barcode scanning was over for the visit. The ceiling is generous on a
   * laptop (a 960px frame decodes in about 45 ms) and is not generous on a
   * cold mid-range phone, or in a backgrounded tab where timers are throttled
   * and the main thread is starved. Those are ordinary conditions, and the
   * shopper's recovery was to leave the screen and come back.
   */
  #strikes = 0;
  /** Set once the WebAssembly has arrived and answered its first read. See `scan`. */
  #loaded = false;
  /** Consecutive decoded (not skipped) frames that found nothing. Item 12. */
  #misses = 0;

  constructor(options: ScannerOptions = {}) {
    if (options.wasmUrl) {
      prepareZXingModule({
        overrides: { locateFile: () => options.wasmUrl as string },
      });
    }
  }

  /**
   * Loads the WebAssembly module.
   *
   * Called explicitly rather than lazily on the first frame, because the first
   * frame is the one the user is pointing at something during, and a 300ms
   * module load there reads as the camera being broken.
   */
  async warm(): Promise<void> {
    if (!this.#ready) {
      this.#ready = readBarcodes(new ImageData(1, 1), { formats: ['EAN13'] })
        .catch(() => null)
        .then(() => { this.#loaded = true; });
    }
    await this.#ready;
  }

  /**
   * Decodes one frame and returns every barcode on it, or null when no decode
   * happened at all (module still loading, or wedged).
   *
   * The difference between `[]` and `null` is the whole of item 7's vote: an
   * empty array is a frame that was read and had no code, which counts AGAINST
   * a code that appears on some frames and not others; null is a frame that was
   * never looked at, which counts for nothing. Nothing is confirmed or emitted
   * here: `BarcodeVote` (votes.ts) decides that, and a press acts on it.
   */
  async read(frame: ImageData): Promise<Sighting[] | null> {
    // Once the module is wedged it never recovers, and every further call adds
    // another promise that will not settle. Answering null immediately keeps
    // the frame loop alive and costs nothing.
    if (this.#wedged) return null;

    /*
     * Not loaded yet means skip this frame, never decode it. Found on a real
     * phone 2026-09-14: the ceiling below used to include the module download,
     * so a reader that took more than a second and a half to arrive over a
     * phone connection (it is a megabyte, fetched alongside the detector's
     * seven) was declared wedged on the very first frame and read nothing for
     * the rest of the visit. Reproduced in headless Chrome by holding the
     * .wasm back three seconds: a barcode in frame for thirty seconds, never
     * read. The frame loop keeps running while this answers null.
     */
    if (!this.#loaded) {
      void this.warm();
      return null;
    }

    const first = await this.#raceDecode(frame, FIRST_PASS_OPTIONS);
    if (first === null) return null;
    const out = toSightings(first);

    if (out.length > 0) {
      this.#misses = 0;
      return out;
    }

    /*
     * ITEM 12. A code that is really there but the first pass missed (poor
     * contrast, uneven shelf light) is worth a second, slower try with
     * preprocessing -- but only once normal decoding has kept missing for a
     * streak, not on the ordinary empty frame. The ordinary empty frame,
     * while the shopper is still sweeping the shelf for something to point
     * at, is not a miss to fix, and doubling decode cost on every one of
     * those is exactly the performance cost camera.md's own analysis warns
     * about (A12.3). The streak resets the moment this fires, win or lose, so
     * preprocessing runs on at most one frame in `PREPROCESS_AFTER_MISSES + 1`
     * rather than on every frame once triggered.
     */
    this.#misses += 1;
    if (!shouldRetryWithPreprocessing(this.#misses)) return out;
    this.#misses = 0;

    const pre = grayscaleContrast(frame);
    const second = await this.#raceDecode(pre as unknown as ImageData, SECOND_PASS_OPTIONS);
    if (second === null) return out;
    const retried = toSightings(second);
    return retried.length > 0 ? retried : out;
  }

  /**
   * One decode, raced against `DECODE_CEILING_MS`, sharing the wedge-strike
   * count with every other call this scanner makes. Both the first attempt
   * and item 12's second attempt go through here, so a preprocessed retry
   * that hangs is caught by the exact same dead-module recovery (D-128) as
   * an ordinary frame, rather than needing its own copy of the race.
   */
  async #raceDecode(frame: ImageData, options: Parameters<typeof readBarcodes>[1]): Promise<ReadResult[] | null> {
    try {
      /*
       * The timeout is the whole point of this race, and it is here because of
       * a failure that took the entire camera down rather than the barcode.
       *
       * The reader's WebAssembly is fetched when the scanner starts. When that
       * fetch cannot complete -- no signal, or a server that answers the .wasm
       * with the wrong content type -- Emscripten aborts the module, and an
       * aborted module's `readBarcodes` never settles. It does not reject, so
       * the catch below never runs. The caller awaits it forever, and the frame
       * loop that awaits the caller schedules no further frames: the reticle
       * stops, the coaching stops, auto-capture stops, and the screen goes on
       * saying "No barcode there" about a barcode it is pointed straight at,
       * for the rest of the session. Measured here on 2026-09-07: with the
       * server unreachable the whole eye died on the first frame and nothing
       * short of leaving the screen brought it back.
       *
       * A decode of a 960px frame takes about 45ms on this machine, so a
       * second and a half is not a budget anything real will hit; it is only a
       * floor under a module that has stopped answering at all.
       */
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), DECODE_CEILING_MS);
      });
      const decoding = readBarcodes(frame, options);
      const decoded = await Promise.race([decoding, timeout]);
      clearTimeout(timer);
      if (decoded === null) {
        /*
         * D-128. The race lost, and the two reasons it can lose are not the
         * same fault. A module Emscripten aborted never settles AT ALL -- that
         * is the failure this whole race exists for, and the one that must end
         * in a wedge, because awaiting it forever stops the frame loop and
         * takes the camera down with it. A module that is merely slow settles
         * LATE.
         *
         * So the outstanding promise is not abandoned: it is watched. If it
         * ever comes back, that is proof of life, and it clears the strikes and
         * the wedge. Its result is dropped -- the frame it describes is long
         * gone and `votes.ts` decides on many frames anyway -- so this buys
         * evidence, never a stale sighting.
         */
        void decoding.then(
          () => { this.#strikes = 0; this.#wedged = false; },
          () => { this.#strikes = 0; this.#wedged = false; },
        );
        /*
         * Strikes, not one shot. A truly dead module leaks one unsettled
         * promise per attempt, so this cannot be unbounded -- WEDGE_STRIKES is
         * the ceiling on that leak and the reason this is a small number.
         */
        this.#strikes += 1;
        if (this.#strikes >= WEDGE_STRIKES) this.#wedged = true;
        return null;
      }
      // A decode that landed inside the ceiling is proof the module answers.
      this.#strikes = 0;
      return decoded;
    } catch {
      return null;
    }
  }
}

/**
 * The first attempt's options, exactly as they were before item 12: a
 * barcode on a shelf is curved, angled, and half in shadow, and these cost
 * milliseconds that are the difference between reading a real shelf and
 * reading a flat test image.
 */
const FIRST_PASS_OPTIONS = {
  formats: [...RETAIL_FORMATS],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 4,
};

/** Item 12's second attempt: the same robustness options, plus denoise, on a preprocessed frame. */
const SECOND_PASS_OPTIONS = { ...FIRST_PASS_OPTIONS, tryDenoise: true };

// EVERY valid code on the frame, not the largest. Item 8: each barcode in
// view is tracked and drawn, and which one the button sends is the vote's
// decision over many frames, never one frame's opinion about size.
function toSightings(results: ReadResult[]): Sighting[] {
  const out: Sighting[] = [];
  for (const r of results) {
    if (r.isValid === false || !r.text) continue;
    const value = extractGtin(r.text, String(r.format));
    if (!value) continue;
    out.push({ value, format: String(r.format), box: boxOf(r) });
  }
  return out;
}

function boxOf(r: ReadResult): Reading['box'] {
  const p = r.position;
  if (!p) return null;
  const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x];
  const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
