/**
 * R79: the shopper's setup survives iOS clearing the app's web storage.
 *
 * iOS can empty a web view's localStorage (low disk, "Offload App", a system cleanup). The device id and
 * its secret already come back from the Keychain (device.js), so the free-scan count and the purchase
 * survive. The setup did not: the look they picked, their price ranges, their agreements and their
 * watchlist all lived only in localStorage, so the app opened as if new and walked them through all of it
 * again. This keeps a small copy of exactly those choices in the Keychain too, and puts it back, before the
 * first screen is chosen (main.js), when the app finds itself blank.
 *
 * WHAT IS COPIED: the setup choices listed in FIELDS, and the watchlist when it is small enough. NOT
 * copied: scan history (the server keeps scans by device id), ratings, corrections and counters.
 *
 * SAFE BY CONSTRUCTION. Restore happens only when the app is blank (no setup of any kind), and takes only
 * the named fields, each checked for its type, so a damaged copy cannot put junk in the store. A
 * deliberate reset writes a blank copy, so a reset is not undone on the next start. Everything here
 * swallows its own failures: a Keychain that is missing, full or slow leaves the app exactly as it was.
 */
import { secureStorage } from './device.js';

export const BACKUP_KEY = 'shin.setupBackup';
const VERSION = 1;
/** The watchlist is backed up only when its JSON is no bigger than this; the setup is backed up regardless. */
const MAX_WATCHLIST_BYTES = 12_000;

const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isBool = (v) => typeof v === 'boolean';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const orNull = (test) => (v) => v === null || test(v);

const FIELDS = {
  city: orNull(isStr),
  seenIntro: isBool,
  personality: orNull(isStr),
  lineUnderPct: orNull(isNum),
  lineOverPct: orNull(isNum),
  lineGreatPct: orNull(isNum),
  linesSet: isBool,
  lineUnit: isStr,
  lineAmounts: isObj,
  alertStyle: orNull(isStr),
  alertMinPct: orNull(isNum),
  torchMode: isStr,
  torchThreshold: isNum,
  buzz: isBool,
  consent: isObj,
  consentSeen: isBool,
  agreement: orNull(isObj),
  permissionsSeen: isBool,
  market: isObj,
};

/** The part of the store that is worth keeping across a wipe. */
export function setupSnapshot(state) {
  const out = {};
  for (const [key, ok] of Object.entries(FIELDS)) {
    if (key in state && ok(state[key])) out[key] = state[key];
  }
  if (Array.isArray(state.watchlist) && state.watchlist.length > 0) {
    try {
      if (JSON.stringify(state.watchlist).length <= MAX_WATCHLIST_BYTES) out.watchlist = state.watchlist;
    } catch { /* not serialisable: leave it out */ }
  }
  return out;
}

/** True when no part of setup has ever been done: the state a wiped app is in. */
export function isBlank(state) {
  return !state.seenIntro && !state.personality && !state.linesSet && !state.agreement && !state.consentSeen && !state.permissionsSeen;
}

/** Puts the setup back when the app is blank and the Keychain holds one. Resolves 'restored' | 'kept' | 'nothing'; never rejects. */
export async function restoreSetupIfWiped({ plugin = secureStorage(), store } = {}) {
  try {
    if (!plugin || !store) return 'nothing';
    if (!isBlank(store.get())) return 'kept';
    let saved;
    try {
      saved = JSON.parse((await plugin.get({ key: BACKUP_KEY }))?.value ?? 'null');
    } catch {
      return 'nothing';
    }
    if (!isObj(saved) || saved.v !== VERSION) return 'nothing';
    const patch = {};
    for (const [key, ok] of Object.entries(FIELDS)) {
      if (key in saved && ok(saved[key])) patch[key] = saved[key];
    }
    if (Array.isArray(saved.watchlist)) patch.watchlist = saved.watchlist;
    if (isBlank({ ...store.get(), ...patch })) return 'nothing'; // a blank copy (after a reset) has nothing to restore
    store.update(patch);
    return 'restored';
  } catch {
    return 'nothing';
  }
}

/**
 * Keeps the Keychain copy current: after the store changes, waits `delayMs` and writes if the copy
 * differs from what was last written. Returns a function that stops it.
 */
export function startSetupBackup({ plugin = secureStorage(), store, delayMs = 1500, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!plugin || !store) return () => {};
  const encode = () => JSON.stringify({ v: VERSION, ...setupSnapshot(store.get()) });
  // A blank app has nothing worth writing, and must not overwrite a good copy it has not yet restored.
  let lastWritten = isBlank(store.get()) ? encode() : null;
  let timer = null;

  async function write() {
    timer = null;
    const text = encode();
    if (text === lastWritten) return;
    try {
      await plugin.set({ key: BACKUP_KEY, value: text });
      lastWritten = text;
    } catch {
      /* Keychain unavailable or full: the app carries on with localStorage alone */
    }
  }
  function changed() {
    if (encode() === lastWritten) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(write, delayMs);
    timer?.unref?.();
  }

  const unsubscribe = store.subscribe(changed);
  changed(); // an app that already has its setup gets its first copy made now
  return () => {
    unsubscribe();
    if (timer !== null) clearTimer(timer);
  };
}
