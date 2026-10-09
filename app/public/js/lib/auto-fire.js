/**
 * The barcode that fires itself (UX build 5, R-25).
 *
 * docs/design/ux-evidence-2026-10-09.md, R-25: "a barcode that is detected and
 * steady for 150 ms fires with no press." Pointing a phone at one barcode is
 * already the decision; the press only added a tap. The eye reports its vote
 * (onBarcodeReady) on every analysis tick while a code is winning, and with null
 * when it loses; this turns "the same code, reported again 150 ms after it was
 * first reported" into one call to `fire`.
 *
 * STEADINESS IS MEASURED ON REPORTS, NOT ON A TIMER. A timer started by the first
 * report would fire on a lone report that the eye never repeated (a stale vote),
 * and would fire during a stall that held the screen's thread for 150 ms with no
 * evidence the code was still there. A code is steady only when the eye says so a
 * second time, at least STEADY_MS later, with nothing else in between. The eye
 * repeats the report each tick (src/eye/camera.ts, #emitBarcodes), so on a phone
 * the delay is one tick past the 150 ms.
 *
 * Rules, each one a way this could scan the wrong thing:
 *  - Steady means the SAME code throughout. Another code, or no code, restarts
 *    the wait, so two barcodes taking turns in frame never fire.
 *  - A code fires ONCE. It cannot fire again until it has left the frame (or
 *    another code has been seen), so a shopper who backs out of the pad with the
 *    tag still in view does not get the same answer thrown back at them. That
 *    was the defect the old press-only rule was written to remove.
 *  - `fire` may throw (the check digit fails). The error is not swallowed here,
 *    it goes to the caller, and the code is already marked spent so one bad read
 *    raises one error, not one per tick.
 *  - The scan press stays for what detection does not cover; it does not use this.
 */

/** How long one code must stay settled before it fires. Borrowed from R-25 (a held overlay confirms a capture); untested in an aisle. */
export const AUTO_FIRE_STEADY_MS = 150;

/**
 * @param {object} opts
 * @param {(read: object) => void} opts.fire      called once per steady code, with the eye's read
 * @param {() => boolean} [opts.canFire]          whether the screen may start a scan right now
 * @param {number} [opts.steadyMs]
 * @param {() => number} [opts.now]               a millisecond clock, replaceable so a test need not wait
 */
export function createAutoFire({ fire, canFire = () => true, steadyMs = AUTO_FIRE_STEADY_MS, now = () => Date.now() } = {}) {
  if (typeof fire !== 'function') throw new TypeError('createAutoFire needs a fire function');
  if (!(steadyMs > 0)) throw new RangeError(`createAutoFire: steadyMs must be above 0, got ${steadyMs}`);
  let current = null;

  return {
    /** The eye's vote changed or repeated: a read, or null when no code is winning. */
    ready(read) {
      if (!read) { current = null; return; }
      if (typeof read.value !== 'string' || read.value === '') {
        throw new Error(`auto-fire: the eye reported a read with no value (${JSON.stringify(read)})`);
      }
      if (current && current.value !== read.value) current = null;
      const at = now();
      if (!current) current = { value: read.value, since: at, spent: false };
      if (current.spent) return;
      if (at - current.since < steadyMs) return;
      // The screen is busy (a sheet is up): the next report looks again.
      if (!canFire()) return;
      current.spent = true;
      fire(read);
    },
    /** Forget everything: the screen is going away. */
    cancel() { current = null; },
  };
}
