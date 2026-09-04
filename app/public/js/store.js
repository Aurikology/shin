/**
 * All app state in one place, persisted to localStorage.
 *
 * There are no accounts. The floor says so explicitly, and it is the right call:
 * the walkthrough's whole argument is that the first scan has to happen before
 * anything is asked of anyone.
 */

const KEY = 'shin.v1';

const EMPTY = {
  /** Stage 03: the only setup question that survives, and it is skippable. */
  city: null,
  seenIntro: false,
  /**
   * Which Shin the user picked. Null means setup has not run, which is the only
   * thing standing between a cold start and the camera. Decision 2026-09-03: the
   * attitude is the user's choice, not ours, and it changes the words around a
   * number without ever changing the number.
   */
  personality: null,
  /** Stage 07: save and watch is the primary action, so this is the real state. */
  watchlist: [],
  /** Every verdict ever shown, which is what stage 12 reads back. */
  history: [],
  /** Stage 06b: corrections the user made. Collected, applied to nothing yet. */
  corrections: [],
  /** Stage 11: fake price drops the demo can fire, so the loop can be seen. */
  drops: [],
  scanCount: 0,
  shareCount: 0,
  /** Stage 09: the paywall arrives after value, never before. */
  proUntil: null,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A private window with storage blocked still has to work. Losing the
    // watchlist is survivable; refusing to run is not.
  }
}

export function get() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(patch) {
  state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
  persist();
  for (const fn of listeners) fn(state);
}

export function reset() {
  state = { ...EMPTY };
  persist();
  for (const fn of listeners) fn(state);
}

/** A verdict the user has seen. Kept whole, so nothing has to be recomputed. */
export function recordVerdict(result, query) {
  update((s) => ({
    ...s,
    scanCount: s.scanCount + 1,
    history: [{ at: new Date().toISOString(), result, query }, ...s.history].slice(0, 100),
  }));
}

export function isWatched(id) {
  return state.watchlist.some((w) => w.id === id);
}

export function toggleWatch(entry) {
  update((s) =>
    s.watchlist.some((w) => w.id === entry.id)
      ? { ...s, watchlist: s.watchlist.filter((w) => w.id !== entry.id) }
      : { ...s, watchlist: [{ ...entry, savedAt: new Date().toISOString() }, ...s.watchlist] },
  );
}

export function isPro() {
  return state.proUntil !== null && Date.parse(state.proUntil) > Date.now();
}
