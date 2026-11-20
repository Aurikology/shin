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
 * WHAT IS COPIED: the setup choices listed in FIELDS; the theme (`shin.theme`) and the language
 * (`shin.locale`), which are their own localStorage keys outside the store; the newest watchlist entries
 * that fit in MAX_WATCHLIST_BYTES; and the newest Past scans that fit in MAX_HISTORY_BYTES, with photo
 * thumbnails left out. NOT copied: ratings, corrections, the undo bin and counters. The server cannot
 * refill Past scans: it keeps scan totals by device id (`/api/scans` returns summaries), not the rows,
 * so this copy is the only way the list comes back.
 *
 * SAFE BY CONSTRUCTION. Restore happens only when the app is blank (no setup of any kind), and takes only
 * the named fields, each checked for its type, so a damaged copy cannot put junk in the store or in
 * localStorage. A deliberate reset writes a blank copy (blank setup, empty history), so a reset is not
 * undone on the next start: a blank copy restores nothing, theme and language included. Everything here
 * swallows its own failures: a Keychain that is missing, full or slow leaves the app exactly as it was.
 */
import { secureStorage } from './device.js';
import { isLocale } from './lib/locale.js';

export const BACKUP_KEY = 'shin.setupBackup';
const VERSION = 1;
/** The watchlist's newest entries are kept up to this many bytes of JSON; the setup is backed up regardless. */
const MAX_WATCHLIST_BYTES = 12_000;
/**
 * Past scans: the newest rows are kept up to this many bytes of JSON. A normal row is 300 to 1,000 bytes
 * once its thumbnail is left out, so this is 24 or more scans, and the whole copy stays under about 40 KB.
 */
const MAX_HISTORY_BYTES = 24_000;
/** A single scan row bigger than this (after thumbnails are left out) is skipped rather than crowding out the rest. */
const MAX_SCAN_ROW_BYTES = 3_000;

const THEME_KEY = 'shin.theme';
const LOCALE_KEY = 'shin.locale';
const THEMES = ['light', 'dark']; // absent means "follow the phone", so 'system' is never copied

const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isBool = (v) => typeof v === 'boolean';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const orNull = (test) => (v) => v === null || test(v);
const isTheme = (v) => THEMES.includes(v);
/** A row Past scans can draw: an object with a string id and date (pastscans.js throws on a missing date). */
const isScan = (v) => isObj(v) && isStr(v.id) && isStr(v.at) && (v.result === undefined || isObj(v.result)) && (v.query === undefined || isObj(v.query));

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

const encoder = new TextEncoder();
const bytes = (text) => encoder.encode(text).length;

/**
 * The longest run of `list`'s leading (newest) items whose JSON array fits in `maxBytes`. `prepare` may
 * slim an item, or return null to skip it. Unserialisable items are skipped.
 */
function newestThatFit(list, maxBytes, prepare = (x) => x) {
  const out = [];
  let used = 2; // the brackets
  for (const item of list) {
    let kept;
    let text;
    try {
      kept = prepare(item);
      if (kept === null || kept === undefined) continue;
      text = JSON.stringify(kept);
    } catch {
      continue;
    }
    if (text === undefined) continue;
    const cost = bytes(text) + (out.length > 0 ? 1 : 0); // the comma
    if (used + cost > maxBytes) break;
    out.push(kept);
    used += cost;
  }
  return out;
}

/** Leaves out every `data:` URL (the 96px scan thumbnails), at any depth. */
function withoutDataUrls(value) {
  if (Array.isArray(value)) return value.map(withoutDataUrls);
  if (!isObj(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (isStr(v) && v.startsWith('data:')) continue;
    out[k] = withoutDataUrls(v);
  }
  return out;
}

function slimScan(row) {
  if (!isScan(row)) return null;
  const slim = withoutDataUrls(row);
  return bytes(JSON.stringify(slim)) <= MAX_SCAN_ROW_BYTES ? slim : null;
}

/** The part of the store that is worth keeping across a wipe. */
export function setupSnapshot(state) {
  const out = {};
  for (const [key, ok] of Object.entries(FIELDS)) {
    if (key in state && ok(state[key])) out[key] = state[key];
  }
  if (Array.isArray(state.watchlist) && state.watchlist.length > 0) {
    const kept = newestThatFit(state.watchlist, MAX_WATCHLIST_BYTES);
    if (kept.length > 0) out.watchlist = kept;
  }
  if (Array.isArray(state.history) && state.history.length > 0) {
    const kept = newestThatFit(state.history, MAX_HISTORY_BYTES, slimScan);
    if (kept.length > 0) out.history = kept;
  }
  return out;
}

function readLocal(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** The theme and language, which live in their own localStorage keys rather than in the store. */
function settingsSnapshot() {
  const out = {};
  const theme = readLocal(THEME_KEY);
  if (isTheme(theme)) out.theme = theme;
  const loc = readLocal(LOCALE_KEY);
  if (isLocale(loc)) out.locale = loc;
  return out;
}

/** Writes a valid theme and language back to localStorage, and shows the theme on this launch. */
function restoreSettings(saved) {
  try {
    if (isTheme(saved.theme) && readLocal(THEME_KEY) === null) {
      globalThis.localStorage?.setItem(THEME_KEY, saved.theme);
      // main.js read the theme before this ran, from a then-empty localStorage. Setting it here is enough
      // for the status bar too: startThemeColourSync watches data-theme.
      const root = globalThis.document?.documentElement;
      if (root) root.dataset.theme = saved.theme;
    }
  } catch { /* private window or no DOM: the theme follows the phone, as before */ }
  try {
    if (isLocale(saved.locale) && readLocal(LOCALE_KEY) === null) globalThis.localStorage?.setItem(LOCALE_KEY, saved.locale);
  } catch { /* as above */ }
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
    if (Array.isArray(saved.history)) patch.history = saved.history.filter(isScan);
    if (isBlank({ ...store.get(), ...patch })) return 'nothing'; // a blank copy (after a reset) has nothing to restore
    restoreSettings(saved);
    store.update(patch);
    return 'restored';
  } catch {
    return 'nothing';
  }
}

/**
 * Keeps the Keychain copy current: after the store changes, or the theme (`shin:theme`, from the You
 * screen) or the language (`shin:locale`, from lib/locale.js) changes, waits `delayMs` and writes if the
 * copy differs from what was last written. Returns a function that stops it.
 */
export function startSetupBackup({ plugin = secureStorage(), store, delayMs = 1500, setTimer = setTimeout, clearTimer = clearTimeout, events = globalThis } = {}) {
  if (!plugin || !store) return () => {};
  const encode = () => JSON.stringify({ v: VERSION, ...setupSnapshot(store.get()), ...settingsSnapshot() });
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
  events?.addEventListener?.('shin:theme', changed);
  events?.addEventListener?.('shin:locale', changed);
  changed(); // an app that already has its setup gets its first copy made now
  return () => {
    unsubscribe();
    events?.removeEventListener?.('shin:theme', changed);
    events?.removeEventListener?.('shin:locale', changed);
    if (timer !== null) clearTimer(timer);
  };
}
