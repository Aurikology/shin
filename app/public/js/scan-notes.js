/**
 * The small things the camera says around a scan, kept apart from the screen so they can be tested
 * without one (2026-11-14, from the owner's note "unknown barcodes, scans with no price, produce").
 *
 *   A RUN OF MISSES. A scan "misses" when Pexi has no price for it: the name preview said
 *   `not_in_catalogue`, or the product is known but `priceKnown` is false. After two in a row the
 *   camera says, once per session, where Pexi is strongest, so a shopper does not keep scanning
 *   things Pexi cannot price. A scan that has a price starts the count again.
 *
 *   THE FIRST-RUN TIP. Until a first barcode has been read on this phone, the aim line also says
 *   which shops and which kind of product Pexi is strongest on. Remembered in localStorage; storage
 *   that throws means the tip shows each visit, which is harmless.
 */

const TIP_KEY = 'pexi.tip.firstScanSeen';

/**
 * Counts scans with no price in a row. `record(true)` for a miss, `record(false)` for a scan that
 * had a price. Answers true exactly once: on the second miss in a row, and never again.
 */
export function createMissTracker({ runLength = 2 } = {}) {
  let run = 0;
  let said = false;
  return {
    record(missed) {
      if (!missed) { run = 0; return false; }
      run += 1;
      if (run >= runLength && !said) { said = true; return true; }
      return false;
    },
    /** For tests: the current run. */
    get run() { return run; },
    get said() { return said; },
  };
}

/** One tracker for the page load, which is the session. */
export const sessionMisses = createMissTracker();

/** Whether this phone has not yet read a first barcode, so the aim line carries the tip. */
export function firstRunTipPending(storage = globalThis.localStorage) {
  try { return storage?.getItem(TIP_KEY) !== '1'; } catch { return true; }
}

/** A first barcode was read: the tip has done its job. */
export function markFirstRunTipSeen(storage = globalThis.localStorage) {
  try { storage?.setItem(TIP_KEY, '1'); } catch { /* private window: the tip may show again, which is harmless */ }
}

/**
 * What the name preview says about a scan: `{ missed, unknown }`.
 *   unknown  Pexi does not know the product (`not_in_catalogue`)
 *   missed   no price on file either way (unknown, or known with `priceKnown === false`)
 * A preview that could not be had (no answer, `preview_unavailable`, no `priceKnown`) says nothing:
 * `missed` is null, so the run is neither extended nor broken.
 */
export function readPreview(id) {
  if (!id || typeof id !== 'object' || id.failure || id.preview !== true) return { missed: null, unknown: false };
  if (id.outcome === 'not_in_catalogue') return { missed: true, unknown: true };
  if (id.outcome === 'preview_unavailable') return { missed: null, unknown: false };
  if (id.priceKnown === false) return { missed: true, unknown: false };
  if (id.priceKnown === true) return { missed: false, unknown: false };
  return { missed: null, unknown: false };
}
