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
  /**
   * The user's two lines, in percent, asked on the setup screen and changeable
   * on the You page. Added 2026-09-14 on the founder's ask: how far below the
   * middle of what was found is worth it, and how far above is past what they
   * will pay.
   *
   * THEY ARE THE USER'S, NOT SHIN'S, and that distinction is the whole reason
   * they exist as stored settings rather than as constants. The price line's
   * three zones are named after these numbers ("under your line", "in the
   * middle", "over your line"), which is what keeps those words a statement
   * about a boundary the user set instead of a grading of the price. A hard
   * rule 2 problem (Competition Act s.74.01(1)(b)) is solved here, in the data
   * model, rather than in a renderer that has to remember to be careful.
   *
   * Ten and ten because the founder named those two numbers as the defaults,
   * not because anything has been measured about them. When something has,
   * that is a reason to change the default and a reason to say so.
   */
  lineUnderPct: 10,
  lineOverPct: 10,
  /**
   * The torch setting (item 11, 2026-09-17): 'auto' lights the shelf itself once
   * the frame is darker than `torchThreshold`; 'off' never does and the camera
   * says on screen when it is too dark. The threshold is a mean luminance on a
   * 0 to 255 scale and starts at Shin's own default (src/eye/torch.ts,
   * DEFAULT_TORCH_THRESHOLD), so a user who never opens the setting gets the
   * behaviour the app already had.
   */
  torchMode: 'auto',
  torchThreshold: 52,
  /** Stage 07: save and watch is the primary action, so this is the real state. */
  watchlist: [],
  /** Every verdict ever shown, which is what stage 12 reads back. */
  history: [],
  /**
   * Stage 06b: corrections the user made, and the outbound queue for them.
   *
   * These are no longer collected and dropped. Each entry carries a `clientId`
   * and a `sentAt`, and `pendingCorrections()` is what has not reached the
   * server yet. Once a correction lands there, the spine reads it back as a
   * price point, so the next verdict on the same product is computed with it.
   *
   * The local copy is kept after sending rather than deleted. It is what the
   * app can show the person about their own contributions without a round trip,
   * and it is the only record if the server ever loses one.
   */
  corrections: [],
  /** Stage 11: fake price drops the demo can fire, so the loop can be seen. */
  drops: [],
  scanCount: 0,
  shareCount: 0,
  /**
   * ISO timestamps of the times Shin has spoken without being asked.
   * AVATAR.md section 3's interruption budget, made real. Pruned to the last
   * day on every read, so this never grows.
   */
  interruptions: [],
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
  /**
   * Item 6: photos and location. Changed 2026-09-14 on the founder's word,
   * "build everything for collecting EVERYTHING": both default ON now,
   * mirroring `app/src/consent.ts`'s own default for a device with no row.
   * This is the client's cached copy of that same decision, painted on the
   * consent screen before any network round trip and read by `api.js`
   * between round trips; the server's own default is what actually governs
   * what gets kept, and stays in sync with this one by construction (both
   * changed together, same day, same reason).
   *
   * `updatedAt` is the timestamp item 6c asks for ("store each choice per
   * device with a timestamp"); it is null until the person actually acts on
   * the consent screen, so a screen can tell "never touched, running on the
   * default" from "touched and left this way", which the switches still let
   * anyone turn off.
   */
  consent: { photos: true, location: false, updatedAt: null },
  /**
   * Whether the first-launch consent screen (item 6b) has been shown and
   * acted on. Separate from `seenIntro`: the attitude picker and the consent
   * screen are two different questions, asked once each, and folding them
   * into one flag would mean an app updated mid-flow could not tell which one
   * a half-finished first launch actually reached.
   */
  consentSeen: false,
  /**
   * Item 8: the thumbs ratings this device has actually sent, keyed by scan
   * id so a repeat tap on the same verdict overwrites rather than piling up,
   * and so item 8d's rated-count row has something of its own to count that
   * survives a reload (the on-screen thumb state does not; it is a class on a
   * DOM node that goes away the moment the sheet does).
   */
  ratings: [],
  /**
   * The shops this person has confirmed they were standing in, and which one
   * they confirmed last in each coarse cell. 2026-09-13, asked for in these
   * words: "instead of them having to input the store they're in multiple
   * times... Shin must be able to identify the pattern of where the user
   * often goes."
   *
   * THIS LIVES HERE AND NOWHERE ELSE, and that is the decision rather than an
   * implementation detail. A record of which shops a named person visits and
   * how often is a record of their week; `app/src/stores.ts` says so in its
   * own header ("a kilometre square plus a repeated visit is a home or a
   * workplace"). So the pattern is learned on the phone, read only by the
   * phone, and there is no server table for it and no field on the wire that
   * carries it. What reaches the server is what already did: the one shop
   * attached to the one price, which the shopper confirmed by tapping it.
   *
   *   known       [{ id, name, hint, count, at }] -- the shops confirmed, and
   *               how often. `count` is the whole of "where they often go".
   *   lastByCell  { [cell]: shopId } -- the shop last confirmed in each cell,
   *               which is what makes the second visit to a shop cost no taps.
   *
   * Both are bounded (see SHOPS_KEPT / CELLS_KEPT), because one entry per cell
   * anybody has ever stood in is a leak with a nice name.
   */
  shops: { known: [], lastByCell: {} },
};

/** How many confirmed shops and how many cells the device remembers. */
const SHOPS_KEPT = 60;
const CELLS_KEPT = 60;

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
  /**
   * A state saved before item 6 has no `consent` at all, or a malformed one;
   * both read as `EMPTY.consent`, the off default (his ruling 2026-09-14), rather than as
   * an explicit off -- a device that never actually recorded a choice runs on
   * the default, same as a device that has never called `/api/consent`. A
   * device that DID record a choice (its `consent` object has a real
   * `updatedAt`) keeps exactly what it recorded, on or off, regardless of
   * where the default sits today.
   */
  /* 2026-09-19: photos default ON (app/src/consent.ts DEFAULT_CONSENT). A saved
     object with no `updatedAt` never recorded a choice, so its `photos: false`
     is the old default and not a no; it reads as the current default. One
     with an `updatedAt` keeps exactly what the person recorded. */
  const consent = s.consent && typeof s.consent === 'object'
    ? {
        photos: s.consent.updatedAt ? s.consent.photos === true : EMPTY.consent.photos,
        location: s.consent.location === true,
        updatedAt: s.consent.updatedAt ?? null,
      }
    : { ...EMPTY.consent };
  const consentSeen = s.consentSeen === true;
  const ratings = Array.isArray(s.ratings) ? s.ratings : [];
  /* A state saved before the shop shortlist has no `shops` at all. Both halves
     are rebuilt defensively rather than trusted: this blob is on a device and
     a half-written one must not take the pad down. */
  const shops = {
    known: Array.isArray(s.shops?.known)
      ? s.shops.known
        .filter((k) => k && typeof k.id === 'string' && typeof k.name === 'string')
        .map((k) => ({
          id: k.id,
          name: k.name,
          hint: typeof k.hint === 'string' ? k.hint : '',
          count: Number.isFinite(k.count) && k.count > 0 ? Math.floor(k.count) : 1,
          at: typeof k.at === 'string' ? k.at : null,
        }))
      : [],
    lastByCell: s.shops?.lastByCell && typeof s.shops.lastByCell === 'object' && !Array.isArray(s.shops.lastByCell)
      ? s.shops.lastByCell
      : {},
  };
  return { ...s, history, watchlist, removed, market, buzz, consent, consentSeen, ratings, shops };
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

/**
 * Why the last read came back empty, or null if it did not fail.
 *
 * `load()` used to collapse two situations that are not the same thing: a
 * person who has saved nothing yet, and a person whose saved things could not
 * be read. Both produced EMPTY, so every list screen drew its empty state --
 * "Nothing saved yet" over somebody's actual watchlist -- and the error branch
 * those screens grew on 2026-09-06 could never fire, because nothing told them.
 *
 *   'corrupt'  the stored JSON did not parse
 *   'blocked'  localStorage threw on read (private window, site data blocked)
 */
let fault = null;

/** @returns {null | 'corrupt' | 'blocked'} */
export function loadFault() {
  return fault;
}

/**
 * Reads storage again and re-derives the fault, for a "Try again" that means
 * it.
 *
 * `fault` was set once, by the `load()` at import, and never re-evaluated;
 * there was no way to ask storage a second time. The three list screens'
 * retry buttons set their phase to ready and repainted, and `get()` handed
 * back the same EMPTY it had before, so a private window or a corrupt blob
 * went from an honest error state to "Nothing saved yet" over the person's
 * actual data -- the exact outcome the error state exists to prevent. A retry
 * that cannot succeed can only mislead.
 *
 * Returns the fault after the attempt, so a caller can re-seed its phase from
 * the answer rather than from hope.
 */
export function reload() {
  fault = null;
  state = load();
  return fault;
}

function load() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    fault = 'blocked';
    return { ...EMPTY };
  }
  if (!raw) return { ...EMPTY };
  try {
    return purgeExpired(migrate({ ...EMPTY, ...JSON.parse(raw) }));
  } catch {
    fault = 'corrupt';
    /*
     * Keep the unreadable blob before anything overwrites it. The next
     * `update()` persists this EMPTY state straight over it, so without this
     * line a single bad byte costs a person their whole watchlist and scan
     * history permanently -- and this data has the same property the
     * corrections database does: nothing can rebuild it.
     */
    try { localStorage.setItem(`${KEY}.unreadable`, raw); } catch { /* nothing more to try */ }
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

/**
 * The percentages offered for `lineUnderPct` and `lineOverPct`.
 *
 * Here rather than on a screen because two screens ask for them (setup asks
 * once, You changes them afterwards) and a second copy of this array is a
 * second copy that goes stale. Four buttons rather than a slider or a number
 * pad: a slider at 390 px is a control nobody lands the value they meant on,
 * and a pad asks a person in an aisle to invent a figure. 10 sits second so
 * the default is not at the end of the row, where it would read as a floor.
 */
export const LINE_CHOICES = [5, 10, 15, 20];

/**
 * The torch slider's range and its starting point (item 11). These three are
 * the same numbers as TORCH_THRESHOLD_MIN, TORCH_THRESHOLD_MAX and
 * DEFAULT_TORCH_THRESHOLD in src/eye/torch.ts, which the browser cannot import
 * without loading the whole eye; test/torch-setting.test.mjs pins the two
 * copies equal, so they cannot drift.
 */
export const TORCH_RANGE = { min: 10, max: 120, start: 52 };

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
  // The session half of the interruption budget lives in memory rather than in
  // state, so wiping state would otherwise leave it standing and a reset user
  // would start their next session already out of unprompted lines.
  resetSessionInterruptions();
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
  // A Gemini answer counts when it had something to show: `answered` was
  // written onto the row's query when the answer landed, so this never opens
  // the answer itself.
  const callable = recent.filter((h) => h.result?.kind === 'verdict' || (h.result?.kind === 'gemini' && h.query?.answered === true)).length;
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
    // A Gemini answer whose shelf price landed under the user's own line is a
    // good find too; `zone` is Gemini's code, copied onto the row, never made here.
    return Number.isFinite(at) && at >= cutoff && (h.result?.tier === 'good' || h.query?.zone === 'under_your_line');
  });
}

/* ------------------------------------------------ the shops on this phone --- */

/**
 * Every shop this device has confirmed, most-confirmed first.
 *
 * Read by `shops.js` to order the shortlist and by nothing else. Never sent
 * anywhere: see the `shops` field's own note above for why that is a decision
 * and not an omission.
 */
export function knownShops() {
  return (state.shops?.known ?? []).slice().sort((a, b) => b.count - a.count);
}

/** The id of the shop last confirmed in this cell, or null. */
export function lastShopIn(cell) {
  if (typeof cell !== 'string' || cell === '') return null;
  return state.shops?.lastByCell?.[cell] ?? null;
}

/**
 * The shopper tapped a shop and said they are in it.
 *
 * Two writes, and they answer the two halves of the ask separately: the count
 * goes up (which shops they often go to, everywhere) and the cell's last shop
 * is set (which shop is right HERE, so the next visit costs no taps).
 *
 * `cell` may be null -- a shop can be confirmed with location off if it ever
 * got onto the screen some other way -- and then only the count moves. A null
 * key in `lastByCell` would be a bucket every cell-less confirmation shared,
 * which is worse than not recording it.
 */
export function confirmShop(cell, shop) {
  if (!shop || typeof shop.id !== 'string' || shop.id === '') return null;
  const entry = {
    id: shop.id,
    name: typeof shop.name === 'string' ? shop.name.trim() : '',
    hint: typeof shop.hint === 'string' ? shop.hint : '',
  };
  if (entry.name === '') return null;
  update((s) => {
    const before = s.shops?.known ?? [];
    const seen = before.find((k) => k.id === entry.id);
    const known = [
      { ...entry, count: (seen?.count ?? 0) + 1, at: new Date().toISOString() },
      ...before.filter((k) => k.id !== entry.id),
    ].slice(0, SHOPS_KEPT);

    let lastByCell = s.shops?.lastByCell ?? {};
    if (typeof cell === 'string' && cell !== '') {
      // Newest key last-written wins and the oldest is dropped first; object
      // key order is insertion order, so re-inserting is how a cell stays fresh.
      const pairs = Object.entries(lastByCell).filter(([c]) => c !== cell);
      pairs.push([cell, entry.id]);
      lastByCell = Object.fromEntries(pairs.slice(-CELLS_KEPT));
    }
    return { ...s, shops: { known, lastByCell } };
  });
  return entry;
}

/**
 * Forgets every shop and every cell. The withdrawal half: turning location
 * consent off must not leave a map of somebody's week behind on the device,
 * and `reset()` is not the only way a person says stop.
 */
export function forgetShops() {
  update((s) => ({ ...s, shops: { known: [], lastByCell: {} } }));
}

/* --------------------------------------------- the interruption budget ---- */

/**
 * AVATAR.md section 3 caps what Shin may say when the user did not act:
 * **two per session, four per day, and zero notifications in v1.** The file is
 * explicit that "no third source may be added without a row in this table".
 *
 * Until now that cap was not enforced anywhere. It was satisfied by accident:
 * the two unprompted sources that exist, the aim-hint escalation and the
 * second-visit callback, each carried a one-shot boolean in the camera screen,
 * so a session could not exceed two because there were only two flags. Nothing
 * counted a day at all, and nothing would have stopped a third source being
 * added and quietly breaking a contract nobody could see.
 *
 * The distinction the budget rests on is AVATAR.md's own: an appearance is
 * **reactive** if it lands within two seconds of the user's own act on the same
 * surface, and reactive appearances are unbudgeted, because capping the answer
 * to a question the user just asked would make the product worse at the only
 * thing it does. Only unprompted appearances come through here.
 */
const UNPROMPTED_PER_SESSION = 2;
const UNPROMPTED_PER_DAY = 4;

/* Session, not day: a reload is a new session by design. The day count is
   persisted; this one deliberately is not. */
let interruptionsThisSession = 0;

function interruptionsToday() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return (state.interruptions ?? []).filter((iso) => {
    const at = Date.parse(iso);
    return Number.isFinite(at) && at >= cutoff;
  });
}

/**
 * Whether Shin may speak unprompted right now. A screen asks before it speaks,
 * and stays silent if the answer is no. It never queues the line for later:
 * the moment an unprompted line was for does not come back.
 */
export function canInterrupt() {
  return interruptionsThisSession < UNPROMPTED_PER_SESSION
    && interruptionsToday().length < UNPROMPTED_PER_DAY;
}

/**
 * Record that Shin spoke unprompted. Called only after the line actually went
 * on screen, never at the point it was considered, or a line that was decided
 * against would still spend the budget.
 */
export function recordInterruption() {
  interruptionsThisSession += 1;
  update((s) => ({ ...s, interruptions: [...interruptionsToday(), new Date().toISOString()] }));
}

/**
 * Clears the session half only. `reset()` calls it, because a user wiping
 * their data should not carry a spent session budget into the next one.
 */
export function resetSessionInterruptions() {
  interruptionsThisSession = 0;
}

/** For the record and for tests: what is left of each cap. */
export function interruptionBudget() {
  return {
    session: UNPROMPTED_PER_SESSION - interruptionsThisSession,
    day: UNPROMPTED_PER_DAY - interruptionsToday().length,
  };
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

/* --------------------------------------------------------------- consent --- */

/** The current consent flags. Never mutated in place; every reader gets the object `update()` last persisted. */
export function consent() {
  return state.consent ?? EMPTY.consent;
}

/**
 * Writes one or both flags, always with a fresh timestamp (item 6c: "store
 * each choice per device with a timestamp"). `patch` is `{ photos? }`,
 * `{ location? }`, or both; a field left out keeps its current value, so the
 * consent screen's two independent toggles and the You screen's withdrawal
 * toggles can both call this with only the one flag they changed.
 */
export function setConsent(patch) {
  update((s) => ({
    ...s,
    consent: {
      photos: patch.photos !== undefined ? !!patch.photos : (s.consent?.photos ?? true),
      location: patch.location !== undefined ? !!patch.location : (s.consent?.location ?? true),
      updatedAt: new Date().toISOString(),
    },
  }));
  return state.consent;
}

export function consentSeen() {
  return state.consentSeen === true;
}

export function setConsentSeen() {
  update({ consentSeen: true });
}

/* --------------------------------------------------------------- ratings --- */

/**
 * Item 8: records (or overwrites) this device's rating for one scan. Keyed by
 * `scanId`, so a changed mind before the four-second undo window closes, or a
 * second look at the same past scan, replaces the earlier entry rather than
 * counting the same scan twice in `ratedCounts()`.
 */
export function recordRating({ scanId, rating, reason }) {
  if (scanId === null || scanId === undefined) return null;
  const entry = { scanId, rating, reason: reason ?? null, at: new Date().toISOString() };
  update((s) => ({
    ...s,
    ratings: [entry, ...s.ratings.filter((r) => r.scanId !== scanId)],
  }));
  return entry;
}

/** The undo: removes this device's rating for a scan entirely, local half of item 8's undo. */
export function deleteRating(scanId) {
  update((s) => ({ ...s, ratings: s.ratings.filter((r) => r.scanId !== scanId) }));
}

export function ratingFor(scanId) {
  return state.ratings.find((r) => r.scanId === scanId) ?? null;
}

/** Item 8d: the You screen's rated counts, this device's own record, nothing projected. */
export function ratedCounts() {
  const up = state.ratings.filter((r) => r.rating === 'up').length;
  const down = state.ratings.filter((r) => r.rating === 'down').length;
  return { up, down, total: up + down };
}

/* ---------------------------------------------------------------------------
 * Corrections, and the queue that gets them to the server.
 *
 * WHY THERE IS A QUEUE AT ALL. The place a correction is typed is the place the
 * signal is worst: a supermarket aisle, often a basement one. A correction that
 * only exists if the POST happens to succeed is a correction lost exactly when
 * the person went to the trouble of typing it. So the write is local and
 * immediate, the send is a separate thing that can fail and be retried, and the
 * screen never waits on the network to say thank you.
 *
 * THIS SHAPE IS THE ONE A PHONE APP RE-IMPLEMENTS. When this becomes an iOS and
 * Android app, `localStorage` is replaced by whatever that platform stores with,
 * and nothing else here changes: the same fields, the same client-generated id,
 * the same three outcomes in `api.js`'s `sendCorrection`. The server has no idea
 * which kind of client is talking to it and must never be given one.
 * ------------------------------------------------------------------------- */

/**
 * Files one correction locally and returns it, ready to send.
 *
 * `clientId` is generated here rather than by the server so that a retry after a
 * timeout is provably the same correction and not a second witness to the same
 * tag. That is the whole reason the id exists.
 *
 * `seenOn` is the day the tag was read, taken now, and it travels with the
 * correction even if it is not sent for days. The number is evidence about that
 * day, and stamping it on arrival would silently refresh a stale price every
 * time a phone came back online.
 */
export function recordCorrection({ code, productId, label, category, amountCents, seller, storeId, kind, scanId }) {
  const entry = {
    clientId: newId(),
    at: new Date().toISOString(),
    seenOn: new Date().toISOString().slice(0, 10),
    /*
     * The scan this price is about, when the caller knows it. Plan item 7c's
     * client half: the server prefers a sent id over its own "the last scan
     * this device made of this product" guess, and that guess is the one that
     * is silently wrong when somebody scans the same thing twice.
     *
     * It is also the ONLY thing that makes a price-only observation possible
     * (2026-09-13, the photo whose barcode was not visible). With no code and
     * no product id, the scan row is the only place the number can hang, so a
     * missing id there is the difference between a recorded price and a
     * refused one.
     */
    scanId: Number.isInteger(scanId) && scanId > 0 ? scanId : null,
    code: code ?? null,
    productId: productId ?? null,
    label: label ?? null,
    category: category ?? null,
    amountCents,
    // Never the string "given". A correction with no real seller is not usable
    // as a comparison point later, and the engine uses that literal word when
    // no store was named.
    seller: (seller ?? '').trim(),
    /*
     * D-081, the client half. `seller` above is the DISPLAY AND MATCHING name
     * -- what the shopper reads on the card, and what the spine's own-store
     * filter matches on -- and it is not a stable key, because two spellings
     * of one shop are two sellers to anything counting them. `storeId` is the
     * identity: OpenStreetMap's own `node/1234` for the shop that was tapped,
     * which is the same shop in both spellings and in both branches of a
     * chain. The server takes both (`locationFor` reads `storeId` and
     * `storeName`) and the spine counts distinct sellers on the identity.
     *
     * Null whenever the name was typed rather than tapped: a hand-typed shop
     * has no identity, and inventing one from the string would be the exact
     * collapse D-081 was opened about.
     */
    storeId: typeof storeId === 'string' && storeId.trim() !== '' ? storeId.trim() : null,
    kind: kind === 'promotional' ? 'promotional' : 'regular',
    sentAt: null,
  };
  update((s) => ({ ...s, corrections: [entry, ...s.corrections] }));
  return entry;
}

/** Everything typed here that the server has not acknowledged, oldest first so the queue drains in order. */
export function pendingCorrections() {
  return state.corrections.filter((c) => !c.sentAt).slice().reverse();
}

/** The server took it. */
export function markCorrectionSent(clientId) {
  update((s) => ({
    ...s,
    corrections: s.corrections.map((c) =>
      c.clientId === clientId ? { ...c, sentAt: new Date().toISOString(), refusedWhy: null } : c,
    ),
  }));
}

/**
 * The server looked at it and will never take it.
 *
 * Marked sent, not deleted, and the reason is kept. A queue that retries
 * something the server has already judged is a queue that never empties, and
 * throwing the row away would lose the one record that the person did type
 * something. Nothing shows `refusedWhy` yet; it is stored so that the day
 * somebody asks why a correction did nothing, the answer is on the device.
 */
export function markCorrectionRefused(clientId, why) {
  update((s) => ({
    ...s,
    corrections: s.corrections.map((c) =>
      c.clientId === clientId ? { ...c, sentAt: new Date().toISOString(), refusedWhy: why ?? 'refused' } : c,
    ),
  }));
}
