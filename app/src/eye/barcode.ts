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
 * WHY A HOLD BEFORE FIRING. Decision 4 auto-advances with no confirm tap, which
 * is only safe if the read is right. A single frame can decode a barcode from a
 * neighbouring product on the shelf as the camera sweeps past. Requiring the
 * same value on several frames inside a short window costs a fraction of a
 * second and removes that whole class of wrong answer.
 */

import { readBarcodes, prepareZXingModule, type ReadResult } from 'zxing-wasm/reader';

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
  /** How many consecutive frames agreed. */
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

export interface ScannerOptions {
  /** Frames that must agree before a read is reported. Decision 4's hold. */
  readonly framesToConfirm?: number;
  /** How long agreeing frames stay valid, in ms. */
  readonly windowMs?: number;
  /** Where the .wasm sits when served. */
  readonly wasmUrl?: string;
}

export class BarcodeScanner {
  readonly #framesToConfirm: number;
  readonly #windowMs: number;
  #recent: { value: string; at: number; box: Reading['box'] }[] = [];
  #ready: Promise<unknown> | null = null;
  #lastFired: { value: string; at: number } | null = null;
  /** Set when the reader stopped answering at all. See `scan`. */
  #wedged = false;
  /** Set once the WebAssembly has arrived and answered its first read. See `scan`. */
  #loaded = false;

  constructor(options: ScannerOptions = {}) {
    this.#framesToConfirm = options.framesToConfirm ?? 3;
    this.#windowMs = options.windowMs ?? 900;
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
   * Reads one frame and returns a value only once it has been confirmed.
   *
   * Returns null on every frame that does not complete a hold, which is most of
   * them. The caller can draw the in-progress box from `peek()` without acting.
   */
  async scan(frame: ImageData): Promise<StableRead | null> {
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

    let results: ReadResult[];
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
      const decoded = await Promise.race([
        readBarcodes(frame, {
          formats: [...RETAIL_FORMATS],
          // A barcode on a shelf is curved, angled, and half in shadow. These cost
          // milliseconds and are the difference between reading a real shelf and
          // reading a flat test image.
          tryHarder: true,
          tryRotate: true,
          tryInvert: true,
          tryDownscale: true,
          maxNumberOfSymbols: 4,
        }),
        timeout,
      ]);
      clearTimeout(timer);
      if (decoded === null) {
        this.#wedged = true;
        return null;
      }
      results = decoded;
    } catch {
      return null;
    }

    const now = Date.now();
    this.#recent = this.#recent.filter((r) => now - r.at <= this.#windowMs);

    const valid = results.filter((r) => r.isValid !== false && r.text);
    if (valid.length === 0) return null;

    // With several codes in frame, the largest is the one being pointed at.
    // A neighbouring product's barcode caught at the edge is always smaller.
    const chosen = valid
      .map((r) => ({ r, area: boxOf(r)?.width ?? 0 }))
      .sort((a, b) => b.area - a.area)[0].r;

    const value = extractGtin(chosen.text, String(chosen.format));
    if (!value) return null;

    this.#recent.push({ value, at: now, box: boxOf(chosen) });
    const agreeing = this.#recent.filter((r) => r.value === value).length;
    if (agreeing < this.#framesToConfirm) return null;

    // Do not fire the same code twice in a row while it stays in frame; the user
    // has already been advanced and re-firing would fight their next action.
    if (this.#lastFired && this.#lastFired.value === value && now - this.#lastFired.at < 4000) {
      return null;
    }
    this.#lastFired = { value, at: now };
    this.#recent = [];

    return { value, format: String(chosen.format), box: boxOf(chosen), frames: agreeing };
  }

  /**
   * The value currently accumulating agreement, and where it sits in frame.
   *
   * This is what the viewfinder draws its barcode mark from, and the mark is
   * the reason the box is carried through `#recent` at all. A scanner that
   * says nothing until it is certain leaves the user with no idea the app
   * wanted a barcode, no idea it is nearly there, and no explanation when the
   * screen suddenly jumps to an answer. Reporting the in-progress read turns
   * all three into one mark that fills up.
   *
   * The box returned is the most recent sighting of the leading value rather
   * than the first, because the mark has to sit where the code is now.
   */
  peek(): { value: string; frames: number; needed: number; box: Reading['box'] } | null {
    const now = Date.now();
    const live = this.#recent.filter((r) => now - r.at <= this.#windowMs);
    if (live.length === 0) return null;
    const counts = new Map<string, number>();
    for (const r of live) counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
    const [value, frames] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    let box: Reading['box'] = null;
    for (const r of live) if (r.value === value && r.box) box = r.box;
    return { value, frames, needed: this.#framesToConfirm, box };
  }

  /** Clears the hold. Call when the user backs out, so a stale read cannot fire. */
  reset(): void {
    this.#recent = [];
    this.#lastFired = null;
  }
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
