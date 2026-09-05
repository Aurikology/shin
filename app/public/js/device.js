/**
 * A random, per-phone identifier: generated once with crypto.randomUUID(),
 * kept in localStorage, and reused forever after. No email, no password,
 * no sign-up, and nothing derived from the device or the person, matching
 * store.js's "there are no accounts" stance -- this is a coin flipped once
 * and remembered, not an account.
 *
 * Plain ES module, no imports: this has to run before anything else the app
 * needs is known to have loaded.
 */

const KEY = 'shin.deviceId';

/** Used only when localStorage itself is unavailable (private-mode Safari, storage disabled). */
let memoryId = null;

/**
 * Returns the device's id.
 *
 * `persistent: true` means the id came from (or was just written to)
 * localStorage and will be the same value next run. `persistent: false`
 * means localStorage threw -- reading it, or writing a freshly generated id
 * to it -- so a fallback id was made up for this session only; it will not
 * survive a reload. Callers get told which happened via the returned flag
 * rather than this function ever throwing.
 */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return { id, persistent: true };
  } catch {
    if (!memoryId) memoryId = crypto.randomUUID();
    return { id: memoryId, persistent: false };
  }
}
