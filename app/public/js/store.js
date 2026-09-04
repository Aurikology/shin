/**
 * All app state in one place, persisted to localStorage.
 *
 * There are no accounts. The floor says so explicitly, and it is the right call:
 * the walkthrough's whole argument is that the first scan has to happen before
 * anything is asked of anyone.
 */

const KEY = 'shin.v1';

/**
 * How long a removed scan or unwatched item is recoverable (OLMA audit row 75,
 * screen 34). Thirty days, stated on the screen itself, never silent.
 */
const REMOVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

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
  /**
   * OLMA audit rows 9, 10, 78: the market a verdict is judged against. Changes
   * nothing in the engine today (build pass 2026-09-04); it is the basis line
   * every verdict names, so it is stored and read by `market()` for the camera
   * side to pick up later. Pre-filled Canada/CAD, matching mockups.html screen 40.
   */
  market: { country: 'Canada', currency: 'CAD' },
  /**
   * OLMA audit row 75, screen 34: a deleted scan or an unwatched item, kept
   * thirty days and restorable in one tap. `kind` is `'scan'` (from `history`)
   * or `'watch'` (from `watchlist`), so restore knows which list to put it back
   * in without guessing from shape.
   */
  removed: [],
  /**
   * OLMA audit row 83: buzz-on-verdicts, a You-page toggle. Default on. "On"
   * is anything that is not literally `false`, so the camera loop (which reads
   * this raw, `store.get().buzz !== false`) and an older stored state with no
   * opinion on the field both read as on.
   */
  buzz: true,
};

/** A stable id, so a history entry can be found again after a re-render. */
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Brings an older localStorage shape up to the current one without throwing.
 * Every field gets a safe default rather than trusting what was there:
 * `history` entries from before this pass have no `id`, `removed` may not
 * exist at all, and `market` may be missing or malformed.
 */
function migrate(s) {
  const history = Array.isArray(s.history)
    ? s.history.map((h) => (h && typeof h.id === 'string' ? h : { ...h, id: newId() }))
    : [];
  const watchlist = Array.isArray(s.watchlist) ? s.watchlist : [];
  const removed = Array.isArray(s.removed) ? s.removed : [];
  const market = s.market && typeof s.market === 'object'
    && typeof s.market.country === 'string' && typeof s.market.currency === 'string'
    ? s.market
    : { ...EMPTY.market };
  /** A state saved before this pass has no `buzz` at all; that reads as on. */
  const buzz = s.buzz !== false;
  return { ...s, history, watchlist, removed, market, buzz };
}

/** Drops anything removed more than thirty days ago. Never throws, never loses anything early. */
function purgeExpired(s) {
  const cutoff = Date.now() - REMOVE_RETENTION_MS;
  const removed = s.removed.filter((r) => {
    const at = Date.parse(r.removedAt);
    return !Number.isFinite(at) || at > cutoff;
  });
  return removed.length === s.removed.length ? s : { ...s, removed };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return purgeExpired(migrate({ ...EMPTY, ...JSON.parse(raw) }));
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

/**
 * A verdict the user has seen. Kept whole, so nothing has to be recomputed and
 * so a past-scans row can never show a different verdict than the one the
 * sheet gave at the moment it happened (the exact OLMA contradiction in audit
 * row 70). The tier lives inside `result` and travels with it; nothing here
 * re-derives it.
 */
export function recordVerdict(result, query) {
  update((s) => ({
    ...s,
    scanCount: s.scanCount + 1,
    history: [{ id: newId(), at: new Date().toISOString(), result, query }, ...s.history].slice(0, 100),
  }));
}

export function isWatched(id) {
  return state.watchlist.some((w) => w.id === id);
}

/**
 * Adds a watch, or removes one. A removal never just disappears: it moves to
 * `removed` (OLMA audit row 75), because it is exactly the "unwatched item"
 * requirement 2 names, whether the tap came from the verdict sheet or from the
 * watchlist page itself.
 */
export function toggleWatch(entry) {
  update((s) => {
    const existing = s.watchlist.find((w) => w.id === entry.id);
    if (existing) {
      return {
        ...s,
        watchlist: s.watchlist.filter((w) => w.id !== entry.id),
        removed: [
          { ...existing, kind: 'watch', removedAt: new Date().toISOString() },
          ...s.removed,
        ].slice(0, 200),
      };
    }
    return { ...s, watchlist: [{ ...entry, savedAt: new Date().toISOString() }, ...s.watchlist] };
  });
}

/** Deletes a past scan. Same recovery rule as unwatching: it moves, it does not vanish. */
export function removeScan(id) {
  update((s) => {
    const entry = s.history.find((h) => h.id === id);
    if (!entry) return s;
    return {
      ...s,
      history: s.history.filter((h) => h.id !== id),
      removed: [
        { ...entry, kind: 'scan', removedAt: new Date().toISOString() },
        ...s.removed,
      ].slice(0, 200),
    };
  });
}

/** Puts a removed scan or watch back where it came from, in one tap. */
export function restoreRemoved(kind, id) {
  update((s) => {
    const entry = s.removed.find((r) => r.kind === kind && r.id === id);
    if (!entry) return s;
    const { kind: _kind, removedAt: _removedAt, ...clean } = entry;
    const removed = s.removed.filter((r) => !(r.kind === kind && r.id === id));
    if (kind === 'watch') return { ...s, removed, watchlist: [clean, ...s.watchlist] };
    return { ...s, removed, history: [clean, ...s.history] };
  });
}

/** The second tap: gone for good. No dialog, this function is the confirmation. */
export function permanentlyRemove(kind, id) {
  update((s) => ({ ...s, removed: s.removed.filter((r) => !(r.kind === kind && r.id === id)) }));
}

/** Called by the recently-removed screen on open, so the thirty-day window is enforced on view, not only on load. */
export function purgeRemoved() {
  update((s) => purgeExpired(s));
}

/** How many days of the thirty-day recovery window are left, floored, never negative. */
export function daysLeft(removedAtIso) {
  const at = Date.parse(removedAtIso);
  if (!Number.isFinite(at)) return 0;
  const left = REMOVE_RETENTION_MS - (Date.now() - at);
  return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
}

/**
 * The market a verdict is judged against (OLMA audit rows 9, 10, 78). Read by
 * the You page and, later, by the engine side; changes nothing in the engine
 * today.
 */
export function market() {
  return state.market ?? EMPTY.market;
}

export function setMarket(country, currency) {
  update((s) => ({ ...s, market: { country, currency } }));
}

/**
 * The weekly line (GAMIFICATION.md mechanic M16): what the person's own record
 * says, nothing projected, nothing ranked, no dollar figure. "Callable" means
 * the scan produced a verdict rather than a refusal; that is the only sense in
 * which Shin "could call" a price.
 */
export function weeklyStats() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = state.history.filter((h) => {
    const at = Date.parse(h.at);
    return Number.isFinite(at) && at >= cutoff;
  });
  const callable = recent.filter((h) => h.result?.kind === 'verdict').length;
  return { scanned: recent.length, callable };
}

export function isPro() {
  return state.proUntil !== null && Date.parse(state.proUntil) > Date.now();
}

/**
 * Whether the user's own record has a good-tier verdict in the last seven
 * days (You page header, proud state). Read from `history` alone, the same
 * seven-day window `weeklyStats` uses: never a projected or invented figure.
 */
export function goodFindThisWeek() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return state.history.some((h) => {
    const at = Date.parse(h.at);
    return Number.isFinite(at) && at >= cutoff && h.result?.tier === 'good';
  });
}

/**
 * OLMA audit row 83: buzz-on-verdicts, a You-page toggle. `buzzOn()` and
 * `setBuzz()` are the accessor pair for a screen that wants the on/off state
 * without reaching into `get().buzz` directly; the camera loop reads the raw
 * field itself (`store.get().buzz !== false`), which stays equivalent to
 * `buzzOn()` by construction.
 */
export function buzzOn() {
  return state.buzz !== false;
}

export function setBuzz(on) {
  update({ buzz: !!on });
}
