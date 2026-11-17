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

/*
 * THE KEYCHAIN (security finding A3, 2026-11-16).
 *
 * The free scans are counted per device id, and localStorage is wiped when the app is deleted, so a reinstall was a
 * fresh allowance. On the iPhone the Keychain survives a reinstall, so the id and the secret are kept there too.
 *
 * getDeviceId and getDeviceSecret above stay synchronous (a dozen callers). The Keychain is asynchronous, so
 * `hydrateDeviceIdentity` runs once at boot (main.js) and brings the two stores into line:
 *   - the Keychain has an id: it wins, and is copied into localStorage (this is the reinstall case);
 *   - it has none: the id and secret this phone already has are copied into it (the migration, or a new phone).
 * On the web, in a wrapper built without the plugin, or when the plugin fails or stalls, nothing changes: the id
 * stays in localStorage exactly as before. It never throws, and the boot waits at most `timeoutMs` for it.
 *
 * The plugin is capacitor-secure-storage-plugin ('SecureStoragePlugin'), found the way the other native plugins are
 * (lib/haptics.js): through window.Capacitor.registerPlugin, no bundler.
 */
const PLUGIN = 'SecureStoragePlugin';
const HYDRATE_TIMEOUT_MS = 1500;

function secureStorageOf(win) {
  try {
    const cap = win?.Capacitor;
    if (!cap || typeof cap.getPlatform !== 'function') return null;
    const platform = cap.getPlatform();
    if (platform !== 'ios' && platform !== 'android') return null;
    if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable(PLUGIN)) return null;
    if (cap.Plugins?.[PLUGIN]) return cap.Plugins[PLUGIN];
    if (typeof cap.registerPlugin === 'function') return cap.registerPlugin(PLUGIN);
  } catch {
    /* no plugin */
  }
  return null;
}

/** The value under `key`, or null when absent (the plugin rejects an absent key). */
async function keychainGet(plugin, key) {
  try {
    const r = await plugin.get({ key });
    const v = r?.value;
    return typeof v === 'string' && v !== '' ? v : null;
  } catch {
    return null;
  }
}

function adopt(key, value, setMemory) {
  setMemory(value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage disabled: the in-memory copy carries this session */
  }
}

async function reconcile(plugin) {
  const keychainId = await keychainGet(plugin, KEY);
  const keychainSecret = await keychainGet(plugin, SECRET_KEY);
  let source = keychainId || keychainSecret ? 'keychain' : 'migrated';
  if (keychainId) adopt(KEY, keychainId, (v) => (memoryId = v));
  if (keychainSecret) adopt(SECRET_KEY, keychainSecret, (v) => (memorySecret = v));
  // Whatever the Keychain lacks, this phone's own value goes in (its id and secret exist by now: getters make them).
  if (!keychainId) await plugin.set({ key: KEY, value: getDeviceId().id });
  if (!keychainSecret) await plugin.set({ key: SECRET_KEY, value: getDeviceSecret() });
  return source;
}

/** Resolves `{ source: 'keychain' | 'migrated' | 'localStorage' }`; never rejects. */
export async function hydrateDeviceIdentity({ win = globalThis.window, timeoutMs = HYDRATE_TIMEOUT_MS } = {}) {
  const plugin = secureStorageOf(win);
  if (!plugin) return { source: 'localStorage' };
  try {
    let timer;
    const timedOut = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const source = await Promise.race([reconcile(plugin).catch(() => null), timedOut]);
    clearTimeout(timer);
    return { source: source ?? 'localStorage' };
  } catch {
    return { source: 'localStorage' };
  }
}
