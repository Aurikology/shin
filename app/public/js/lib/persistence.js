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

/*
 * The line that goes with a false answer here lives in voice.js as
 * `storage_not_kept`, with all three personalities, as of 2026-09-06. It was
 * briefly a constant in this file, which voice.js's own opening rule forbids:
 * no string Shin says is written inside anything but voice.js. This module
 * answers the question; it does not phrase the answer.
 */
