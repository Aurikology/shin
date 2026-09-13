/**
 * Whether a choice made on this screen will still be here tomorrow.
 *
 * `store.js`'s `persist()` swallows the write:
 *
 *     try { localStorage.setItem(KEY, JSON.stringify(state)); }
 *     catch {
 *       // A private window with storage blocked still has to work. Losing the
 *       // watchlist is survivable; refusing to run is not.
 *     }
 *
 * That call is right -- the app must not refuse to run -- but it is only half
 * the job. In a private window, or with site data blocked, in-memory state
 * updates and the screen paints the new choice, so setup, market and the
 * correction screen all report success for a write that did not happen. The
 * three screens that ask a person to commit something are exactly the three
 * where silently losing it is worst.
 *
 * So this is the error state those screens were missing. It is not a network
 * state, because none of them make a request: setup and market are pure local
 * writes, and `corrections.js` states in its own header that the send is
 * deliberately fire-and-forget and "NOTHING HERE THROWS AT A CALLER". Inventing
 * a spinner over either would be inventing a failure mode the code does not
 * have. This is the failure mode it does have.
 *
 * Probed once per page load and cached. The answer cannot change inside a
 * session, and this is called from render paths.
 */

const PROBE_KEY = 'shin.probe';

let cached = null;

/**
 * True if a write survives a read back. Writes and removes a throwaway key
 * rather than trusting the presence of `localStorage`: Safari in private mode
 * historically exposed the object and threw on `setItem`, and a browser set to
 * block site data can expose it and keep nothing.
 */
export function storagePersists() {
  if (cached !== null) return cached;
  try {
    localStorage.setItem(PROBE_KEY, '1');
    cached = localStorage.getItem(PROBE_KEY) === '1';
    localStorage.removeItem(PROBE_KEY);
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * One small named setting, read back.
 *
 * ADDED WITH THE FRENCH INTERFACE, and it lives here rather than in store.js
 * on purpose. `store.js` holds the scan history, the watchlist and the consent
 * flags, and every one of those is read through a module that imports it. The
 * locale has to be readable from `voice.js` and from `ui-strings.js`, which are
 * the two files every screen imports, so hanging it off the state blob would
 * have put the whole store in front of the first string the app ever prints.
 * This module already owns the question "will a write survive", already caches,
 * and already imports nothing, so it is the one place a table of strings can
 * ask what language it is in without dragging the app behind it.
 *
 * Failure is a read of the fallback, never a throw: the same private-window
 * case `storagePersists` exists to describe.
 */
export function readSetting(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

/**
 * Writes one small named setting. Returns whether it is actually going to be
 * there next time, so a caller can say so rather than reporting a success it
 * did not get. That is the same half-a-job `storagePersists` above exists to
 * finish, applied to the write instead of to the probe.
 */
export function writeSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return false;
  }
  return storagePersists();
}

/*
 * The line that goes with a false answer here lives in voice.js as
 * `storage_not_kept`, with all three personalities, as of 2026-09-06. It was
 * briefly a constant in this file, which voice.js's own opening rule forbids:
 * no string Shin says is written inside anything but voice.js. This module
 * answers the question; it does not phrase the answer.
 */
