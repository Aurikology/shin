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

/*
 * The device's secret: a second random value, made and kept exactly like the
 * id, and sent beside it on every request (api.js, `x-shin-device-key`).
 *
 * WHY THERE ARE TWO. The id is a name, and names travel: it is in URLs, logs
 * and the purchase service. Anyone who learned it could read and write this
 * phone's consent, events and thumbs (D-155 and its siblings). The server now
 * ties the id to the first secret it sees and answers about the device only
 * to requests carrying that secret, so knowing the id is no longer enough.
 * The secret goes in a header and nowhere else.
 *
 * Made the first time it is asked for, so a phone that already has an id
 * keeps it and simply gains a secret on its next request.
 */
const SECRET_KEY = 'shin.deviceSecret';
let memorySecret = null;

function freshSecret() {
  // Two UUIDs without their dashes: 64 hex characters, 244 random bits.
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

/** Returns the device's secret, making and keeping it on first use. Never throws. */
export function getDeviceSecret() {
  try {
    let secret = localStorage.getItem(SECRET_KEY);
    if (!secret) {
      secret = freshSecret();
      localStorage.setItem(SECRET_KEY, secret);
    }
    return secret;
  } catch {
    if (!memorySecret) memorySecret = freshSecret();
    return memorySecret;
  }
}
