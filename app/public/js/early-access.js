/**
 * EARLY ACCESS: telling the shopper, before a miss, that Pexi does not know every product yet.
 *
 * Aurik, 2026-11-15: "we will need to communicate the user that we dont have very specific items",
 * by "a persistent or first-time banner or modal right on the home screen or menu bar to state that
 * the app is in ... Early Access, that this is currently general items and more products will be
 * posted". Only 27% of 176 real scans had a shop price (Jamin's note, 2026-11-14).
 *
 * The camera is the home screen: a banner under the top band until the shopper taps Got it. Remembered
 * in localStorage; storage that throws means the banner shows each visit, which is harmless.
 *
 * 2026-11-21 (readiness review, blind 9): the words "early access" and the badge that said them are gone.
 * Apple guideline 2.2 says betas belong on TestFlight. The banner keeps the point: Pexi knows everyday
 * groceries best, new prices come every week, more products are coming.
 */

export const EARLY_ACCESS_KEY = 'pexi.earlyAccess.seen';

/** Whether the banner still has to be shown on this phone. */
export function earlyAccessPending(storage = globalThis.localStorage) {
  try { return storage?.getItem(EARLY_ACCESS_KEY) !== '1'; } catch { return true; }
}

/** The shopper tapped Got it. */
export function dismissEarlyAccess(storage = globalThis.localStorage) {
  try { storage?.setItem(EARLY_ACCESS_KEY, '1'); } catch { /* private window: shown again next visit */ }
}
