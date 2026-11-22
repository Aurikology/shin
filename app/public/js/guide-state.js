/**
 * Whether the new-user walkthrough (screens/guide.js) has been seen, and where a launch lands because
 * of it. Its own module, not the screen's, because screens never import one another (router.js) and
 * both main.js and screens/permissions.js decide a landing with it.
 */

export const GUIDE_KEY = 'pexi.guide.seen';

/** Whether this phone still has to see the walkthrough. */
export function guidePending(storage = globalThis.localStorage) {
  try { return storage?.getItem(GUIDE_KEY) !== '1'; } catch { return true; }
}

/** The walkthrough was finished or skipped. */
export function markGuideSeen(storage = globalThis.localStorage) {
  try { storage?.setItem(GUIDE_KEY, '1'); } catch { /* private window: shown again next launch */ }
}

/**
 * Where a launch lands once the first-run screens are answered: the walkthrough stands in front of
 * the camera until it has been seen, and every other screen passes through unchanged. main.js and
 * permissions.js both ask this, so the launch order stays onboarding-flow.js `firstScreen` plus
 * this one step.
 */
export function landing(id, storage = globalThis.localStorage, state = null) {
  /* A phone that has already scanned knows how Pexi works: an update does not put the walkthrough in
     front of a tester who has been using the app (it stays one tap away on You). */
  if (Array.isArray(state?.history) && state.history.length > 0) return id;
  return id === 'camera' && guidePending(storage) ? 'guide' : id;
}

