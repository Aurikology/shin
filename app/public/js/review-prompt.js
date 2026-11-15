/**
 * The App Store and Google Play review prompt: when Pexi lets the PHONE ask for a rating, and never
 * more than that.
 *
 * WHAT THIS FILE MAY DO, AND THE COST OF DOING MORE. The only ask is the platform's own prompt
 * (iPhone: AppStore.requestReview / SKStoreReviewController; Android: the Play In-App Review API),
 * reached through the native plugin `InAppReview`. There is no Pexi-drawn "rate us" dialog, no
 * "do you like Pexi?" question before it or tied to it, and nothing is given for rating. Each of
 * those is a named cost, not a taste: Apple can remove the app and close the developer account,
 * Google Play policy forbids the same, and Canada's Competition Bureau treats steered or paid
 * reviews as deceptive. The user-started "Rate Pexi" row on the You page is separate, is never shown
 * in or tied to the prompt, and lives in screens/you.js.
 *
 * WHEN IT ASKS (every line must hold; `shouldAskForReview` is the one place that says so):
 *   - the answer's basis is own_prices (real shop prices) and its zone is great or good;
 *   - no thumbs-down on that scan, and no correction opened on it;
 *   - at least the third such win, on at least two different local days;
 *   - not the first session;
 *   - the last two scans were not misses (no price, or not in the catalogue);
 *   - at least 120 days since the last ask (the app version plays no part: it can sit unchanged for months).
 * The ask goes about a second AFTER the shopper closes that answer sheet, and only if the camera is
 * back at rest: never over the camera mid-scan, the price pad, a sheet or the keyboard.
 *
 * STATE LIVES ON THE PHONE (lib/persistence.js's readSetting / writeSetting, one JSON value). Storage
 * that throws reads as an empty record, so the worst case is no ask, never a crash or a nag.
 *
 * THE ONE EVENT: `review_asked`, with the platform and the app version and nothing about the person.
 * The platform decides whether the prompt shows at all (it rations itself and shows nothing in
 * TestFlight), so the event records that Pexi ASKED, not that anything appeared.
 */

import { readSetting, writeSetting } from './lib/persistence.js';
import { usableVerdict, asShown, shopperFor, shopperOf } from './lib/verdict-chart.js';

export const REVIEW_KEY = 'pexi.review.v1';
/** A third win, and the wins on two different days. */
export const MIN_WINS = 3;
export const MIN_WIN_DAYS = 2;
/** At least this many days between two asks (the platforms ration it as well). */
export const MIN_DAYS_BETWEEN_ASKS = 120;
/** How long after the sheet closes the ask goes out. */
export const ASK_DELAY_MS = 1000;
/** The zones that count as a win. */
export const WIN_ZONES = Object.freeze(['great', 'good']);
/** The only basis that counts: real shop prices. */
export const WIN_BASIS = 'own_prices';

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 8;

/** The local calendar day, `YYYY-MM-DD`. A shopper's "day" is theirs, not UTC's. */
export function localDay(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyState() {
  return { v: 1, sessions: 0, wins: 0, winDays: [], recent: [], lastAskedAt: null };
}

/** The saved record, cleaned. Anything unreadable is an empty record. */
export function readState(read = readSetting) {
  let raw = null;
  try { raw = JSON.parse(read(REVIEW_KEY, '') || 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return emptyState();
  const n = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  const strings = (xs) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string') : []);
  return {
    v: 1,
    sessions: n(raw.sessions),
    wins: n(raw.wins),
    winDays: strings(raw.winDays).slice(-KEEP_DAYS),
    recent: (Array.isArray(raw.recent) ? raw.recent.filter((x) => typeof x === 'boolean') : []).slice(-2),
    lastAskedAt: Number.isFinite(raw.lastAskedAt) ? raw.lastAskedAt : null,
  };
}

export function writeState(state, write = writeSetting) {
  try { return write(REVIEW_KEY, JSON.stringify(state)); } catch { return false; }
}

/**
 * Whether an answer is a win, and which one: `{ basis, zone }` when the verdict is built on own_prices and
 * the shopper's price lands in great or good, else null. Worked out the way the sheet draws it (the price
 * typed on the sheet, else the server's reading of the tag), so the word the shopper saw is the word counted.
 */
export function winOf(rawVerdict, typedCents = null) {
  const v = usableVerdict(rawVerdict);
  if (!v) return null;
  const base = asShown(v);
  const s = typedCents ? shopperFor(typedCents, base) : base.shopper ? shopperOf(base) : null;
  const zone = s?.zone ?? null;
  if (base.basis !== WIN_BASIS || !WIN_ZONES.includes(zone)) return null;
  return { basis: base.basis, zone };
}

/**
 * THE DECISION. Pure: the record on the phone (with this win already counted) and the facts of the answer
 * just closed go in, `{ ask, blockedBy }` comes out. `blockedBy` names the first line that failed, for the
 * tests and for anyone asking "why did it not ask".
 *
 *   state    the record, as `readState` returns it
 *   win      `winOf`'s result for the answer just closed (null when it was not a win)
 *   thumbDown / corrected   the shopper marked this scan wrong, or opened the correction on it
 *   now      ms
 */
export function shouldAskForReview({ state, win, thumbDown = false, corrected = false, now }) {
  const blocked = (blockedBy) => ({ ask: false, blockedBy });
  if (!win || win.basis !== WIN_BASIS) return blocked('not_own_prices');
  if (!WIN_ZONES.includes(win.zone)) return blocked('zone');
  if (thumbDown) return blocked('thumb_down');
  if (corrected) return blocked('corrected');
  if (state.wins < MIN_WINS) return blocked('few_wins');
  if (new Set(state.winDays).size < MIN_WIN_DAYS) return blocked('one_day');
  if (state.sessions < 2) return blocked('first_session');
  if (state.recent.length < 2 || state.recent.some((missed) => missed !== false)) return blocked('recent_miss');
  if (state.lastAskedAt !== null && now - state.lastAskedAt < MIN_DAYS_BETWEEN_ASKS * DAY_MS) return blocked('too_soon');
  return { ask: true, blockedBy: null };
}

/**
 * Whether the camera is in the middle of something, so an ask now would land over it: the screen is gone,
 * the app is in the background, the camera is not at rest, a sheet or the price pad is up, or a field has
 * the keyboard. Pure; the camera fills it in from the page.
 */
export function reviewBlocked({ dead = false, hidden = false, state = 'idle', sheetOpen = false, padOpen = false, typing = false } = {}) {
  return dead || hidden || state !== 'idle' || sheetOpen || padOpen || typing;
}

/** 'ios', 'android' or 'web'. Anything Capacitor does not report as a store platform is the web. */
export function platformOf(win = globalThis.window) {
  const cap = win?.Capacitor;
  const p = typeof cap?.getPlatform === 'function' ? cap.getPlatform() : 'web';
  return p === 'ios' || p === 'android' ? p : 'web';
}

/** The native plugin, or null on the web or in a wrapper built without it. Same lookup as lib/haptics.js. */
function pluginOf(win) {
  const cap = win?.Capacitor;
  if (!cap || platformOf(win) === 'web') return null;
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('InAppReview')) return null;
  if (cap.Plugins?.InAppReview) return cap.Plugins.InAppReview;
  if (typeof cap.registerPlugin === 'function') return cap.registerPlugin('InAppReview');
  return null;
}

/**
 * Hands the ask to the phone. Returns 'asked', or 'web' (a browser: nothing to do) or 'unavailable' (a wrapper
 * built without the plugin). Never throws; a rejected bridge call is passed to `onFault`.
 */
export function requestNativeReview(win = globalThis.window, onFault = () => {}) {
  if (platformOf(win) === 'web') return 'web';
  const plugin = pluginOf(win);
  if (!plugin || typeof plugin.requestReview !== 'function') return 'unavailable';
  try {
    const result = plugin.requestReview();
    if (result && typeof result.then === 'function') result.then(undefined, onFault);
  } catch (err) {
    onFault(err);
  }
  return 'asked';
}

/**
 * The prompter one camera screen holds. Everything the world touches is injected so the timing runs in a test:
 *
 *   win          the window (Capacitor lives on it)
 *   now          () => ms
 *   track        (type, payload) => void, the app's event queue
 *   version      this build's app version
 *   isBlocked    () => boolean, true while the camera is mid-something (see `reviewBlocked`)
 *   read/write   the phone's small-settings store
 *   setTimer / clearTimer   timers
 */
export function createReviewPrompter({
  win = globalThis.window,
  now = Date.now,
  track = () => {},
  version = '',
  isBlocked = () => false,
  read = readSetting,
  write = writeSetting,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  let timer = null;
  let sessionCounted = false;

  const load = () => readState(read);
  const save = (state) => writeState(state, write);

  return {
    /** Once per page load: the first call counts a session. */
    noteSession() {
      if (sessionCounted) return;
      sessionCounted = true;
      const state = load();
      state.sessions += 1;
      save(state);
    },

    /** One scan finished: `missed` is true when Pexi had no price or did not know the product. */
    noteScan(missed) {
      const state = load();
      state.recent = [...state.recent, missed === true].slice(-2);
      save(state);
    },

    /**
     * The shopper closed an answer sheet. Counts the win, decides, and when the answer is yes schedules the ask
     * one second out. Returns the decision (`{ ask, blockedBy }`, or `{ ask: false, blockedBy: 'web' }`).
     */
    answerClosed({ verdict, typedCents = null, thumbDown = false, corrected = false } = {}) {
      if (platformOf(win) === 'web') return { ask: false, blockedBy: 'web' };
      const win_ = winOf(verdict, typedCents);
      const state = load();
      // A win the shopper marked wrong, or corrected, is not a win to count.
      if (win_ && !thumbDown && !corrected) {
        const today = localDay(now());
        state.wins += 1;
        if (!state.winDays.includes(today)) state.winDays = [...state.winDays, today].slice(-KEEP_DAYS);
        save(state);
      }
      const decision = shouldAskForReview({ state, win: win_, thumbDown, corrected, now: now() });
      if (!decision.ask) return decision;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        // Looked at again when the second is up: a new scan, a sheet, the pad or the keyboard means not now.
        if (isBlocked()) return;
        const result = requestNativeReview(win, (err) => {
          console.error('review prompt fault:', err);
          track('review_fault', { message: String(err instanceof Error ? err.message : err).slice(0, 200) });
        });
        if (result !== 'asked') return;
        const after = load();
        after.lastAskedAt = now();
        save(after);
        track('review_asked', { platform: platformOf(win), appVersion: version });
      }, ASK_DELAY_MS);
      return decision;
    },

    /** Drops a pending ask (the screen is going away). */
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },

    /** For tests. */
    get pending() { return timer !== null; },
  };
}
