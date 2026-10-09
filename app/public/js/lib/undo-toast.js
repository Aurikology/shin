/**
 * The undo window (UX evidence R-94): four seconds, and the clock stops while a finger is on it.
 *
 * Removing a saved item asks no confirmation because it can be undone, so the undo has to be
 * there long enough to be used. It stays open for exactly `durationMs` (4000 by ruling), the time
 * stops while the toast is pressed, and the time that was left carries on after release: a thumb
 * resting on Undo while the shopper reads it must not lose them the window.
 *
 * An undo with nothing to restore is a lie told in a button, so the factory throws if `restore`
 * is not a function. A restore that fails is not caught here either: the error reaches whoever
 * tapped, and the toast is already closed so the tap cannot be repeated onto a half-done state.
 *
 * Time is counted in ticks of TICK_MS rather than read off a clock, so a paused window loses at
 * most one tick and the countdown is the same under a mocked timer as on a phone.
 */

export const UNDO_MS = 4000;
const TICK_MS = 100;

/**
 * The tap on Undo. A screen that hears the tap with no toast behind it has a bug, and says which screen
 * rather than doing nothing under a finger that thought it was undoing.
 */
export function undoNow(toast, screen) {
  if (!toast) throw new Error(`undoNow(${screen}): Undo was tapped with no removal to undo`);
  toast.undo();
}

/**
 * @param {{ label: string, restore: () => void, durationMs?: number, onClose?: () => void }} spec
 * @returns {{ readonly isOpen: boolean, readonly durationMs: number, press(): void, release(): void, undo(): void, close(): void }}
 */
export function createUndoToast(spec) {
  const { label, restore, durationMs = UNDO_MS, onClose } = spec ?? {};
  if (typeof label !== 'string' || label.trim() === '') throw new TypeError('createUndoToast: a label is required, the toast says what was removed');
  if (typeof restore !== 'function') throw new TypeError('createUndoToast: restore must be a function; a toast that offers Undo and cannot undo is a lie');
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError(`createUndoToast: durationMs is ${durationMs}; a zero or unreadable window is a silent failure`);

  let open = true;
  let pressed = false;
  const total = Math.ceil(durationMs / TICK_MS);
  let counted = 0;
  let timers = [];

  function clearPending() {
    for (const h of timers) clearTimeout(h);
    timers = [];
  }

  function finish() {
    open = false;
    clearPending();
    if (typeof onClose === 'function') onClose();
  }

  function tick() {
    if (!open || pressed) return;
    counted += 1;
    if (counted >= total) finish();
  }

  /* Every remaining tick is scheduled up front, each at its own offset, instead of one timer
     chaining the next: a chained timer started inside a callback is measured from the END of a
     mocked (or throttled) tick, so a long jump of the clock would count as a single tick. */
  function arm() {
    clearPending();
    for (let i = 1; i <= total - counted; i += 1) timers.push(setTimeout(tick, i * TICK_MS));
  }
  arm();

  return {
    get isOpen() { return open; },
    get durationMs() { return durationMs; },
    label,
    /** A finger is down on the toast: stop the clock. */
    press() {
      if (!open) return;
      pressed = true;
      clearPending();
    },
    /** The finger is up: carry on with what was left. */
    release() {
      if (!open) return;
      pressed = false;
      arm();
    },
    /** Tap on Undo: close, then run the restore once. A second tap throws. */
    undo() {
      if (!open) throw new Error(`undo toast "${label}" is already closed: the restore ran, or the window ran out`);
      finish();
      restore();
    },
    close() {
      if (open) finish();
    },
  };
}
