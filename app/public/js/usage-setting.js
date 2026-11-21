/**
 * "Share usage data" (You screen), 2026-11-21 readiness review: legal round 2 finding 7 (Quebec and federal
 * guidance want a choice for collection the service does not need) and apple-rules 8 (guideline 5.1.1(ii):
 * an easy way to withdraw consent). Gap 82.
 *
 * ON BY DEFAULT, as the apple-rules fix asks. Off means `track.js` queues nothing and sends nothing, and
 * what was already queued on this phone is dropped. It covers only `track.js`'s usage events (opens,
 * screens, taps, errors). The scan itself, the shelf price, ratings and corrections are the service and go
 * through their own routes; the consent and agreement records keep going, as they are the record of a choice.
 *
 * Its own small file, not part of `track.js`: the You screen reads it, and importing `track.js` from a
 * screen arms its listeners, which the You screen's tests cannot run (see the note in screens/you.js).
 *
 * Kept in this module as well as storage, so a private window that cannot store the choice still honours
 * it for the session.
 */

export const USAGE_OFF_KEY = 'pexi.usage.off';

function readOff() {
  try { return globalThis.localStorage?.getItem(USAGE_OFF_KEY) === '1'; } catch { return false; }
}

let off = readOff();
const listeners = new Set();

/** True unless the shopper switched usage sharing off. */
export function usageSharingOn() {
  return !off;
}

/** The You screen's switch. Returns the state now in force. */
export function setUsageSharing(on) {
  off = !on;
  try {
    if (off) globalThis.localStorage?.setItem(USAGE_OFF_KEY, '1');
    else globalThis.localStorage?.removeItem(USAGE_OFF_KEY);
  } catch { /* private window: honoured for this session only */ }
  for (const fn of listeners) {
    try { fn(!off); } catch { /* a listener's fault is its own */ }
  }
  return !off;
}

/** `track.js` listens so switching off empties the queue at once. */
export function onUsageSharingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
