/**
 * Which shop is this price being written down at, and how the shopper stops
 * being asked.
 *
 * ASKED FOR IN THESE WORDS, 2026-09-13: "can we allow shin to use their
 * location and then assess instead of them having to input the store they're
 * in multiple times. Also Shin must be able to identify the pattern of where
 * the user often goes."
 *
 * Two answers, and they are different mechanisms wearing one feature:
 *
 *   THE FIRST VISIT TO A CELL costs one tap. Location narrows a kilometre
 *   square down to the handful of shops in it (`/api/stores`, which is
 *   OpenStreetMap and holds nothing about anybody), the shopper taps the one
 *   they are standing in, and that is the last question for that shop.
 *
 *   EVERY VISIT AFTER THAT costs none. The tap is remembered against the
 *   cell, so the shop is already selected when the pad opens and the shopper
 *   confirms nothing.
 *
 * LOCATION NARROWS, IT DOES NOT DECIDE, and that distinction is the whole
 * privacy argument. Nothing here ever picks a shop from a position: a
 * kilometre square in a strip-mall town contains six supermarkets and
 * choosing one of them would be guessing with a false confidence, while a
 * square precise enough to choose would be a square that names the shopper's
 * home. The shortlist is a list; a person answers it. The cell stays at 0.01
 * degrees (`geocell.js`), and if something here ever seems to need a finer
 * one, the answer is a shorter list.
 *
 * THE PATTERN NEVER LEAVES THE PHONE. `store.js`'s `shops` field holds the
 * counts and the per-cell memory; `app/src/stores.ts` states plainly that a
 * cell plus a repeated visit is a home or a workplace, so a server table of
 * "which shops does device X keep going to" is the one thing this feature
 * must not create. The wire carries exactly what it carried before: the one
 * shop on the one price, tapped by the person sending it.
 *
 * EVERYTHING WITH A DECISION IN IT IS PURE AND EXPORTED. `orderShops` and
 * `preselectId` take their inputs as arguments and read no module state, so
 * `app/test/shops.test.mjs` can drive them without a DOM, a network or a
 * geolocation stub -- the same split `lib/radiogroup.js` made for the same
 * reason.
 */

import * as store from './store.js';
import * as api from './api.js';
import { currentCell, refreshCell } from './geocell.js';

/* ------------------------------------------------------------------- pure -- */

/**
 * The shortlist, in the order it goes on screen.
 *
 * @param {{id:string,name:string,hint?:string}[]} nearby  what `storesNear`
 *   returned for this cell, already nearest-first.
 * @param {object} [opts]
 * @param {{id:string,name:string,hint?:string,count:number}[]} [opts.known]
 *   this device's confirmed shops. Used for the ordering only.
 * @param {string|null} [opts.lastId]  the shop last confirmed in THIS cell.
 *
 * The order is the brief's own, and each rung answers a different question:
 *
 *   1. the shop last confirmed in this cell   -- "you were here last time"
 *   2. then by how often this device has confirmed it -- "you often go here"
 *   3. then whatever order `storesNear` gave  -- which is by distance
 *
 * THE LAST-CONFIRMED SHOP IS ADDED IF IT IS MISSING. Overpass is a volunteer
 * server and an empty answer is a normal Tuesday (`stores.ts` says so); a
 * shopper standing in the shop they were in yesterday must not lose it
 * because a third party was busy. Nothing else remembered is added: a shop
 * confirmed in another city is not near this cell and offering it would be
 * the device's memory overruling the world.
 *
 * Deduplicated on `id`, because the added shop is usually in `nearby` too.
 */
export function orderShops(nearby, { known = [], lastId = null } = {}) {
  const clean = (s) => ({
    id: String(s.id),
    name: String(s.name ?? '').trim(),
    hint: String(s.hint ?? ''),
  });
  const list = (Array.isArray(nearby) ? nearby : [])
    .filter((s) => s && typeof s.id === 'string' && String(s.name ?? '').trim() !== '')
    .map(clean);

  const byId = new Map(list.map((s) => [s.id, s]));
  if (lastId && !byId.has(lastId)) {
    const remembered = known.find((k) => k.id === lastId);
    if (remembered) {
      const added = clean(remembered);
      list.push(added);
      byId.set(added.id, added);
    }
  }

  const counts = new Map(known.map((k) => [k.id, k.count ?? 0]));
  // The original order is the third rung, so it is captured before sorting
  // rather than left to the sort's own stability, which is a promise about
  // the algorithm and not about this rule.
  const at = new Map(list.map((s, i) => [s.id, i]));
  // `count` rides out with each shop so the screen can mark the ones this
  // person already goes to. It is the device's own number and it is read on
  // the device; nothing sends it.
  for (const s of list) s.count = counts.get(s.id) ?? 0;
  return list.slice().sort((a, b) => {
    if (a.id === lastId) return b.id === lastId ? 0 : -1;
    if (b.id === lastId) return 1;
    const byCount = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
    if (byCount !== 0) return byCount;
    return at.get(a.id) - at.get(b.id);
  });
}

/**
 * Which shop should already be selected when the pad opens, or null.
 *
 * ONLY EVER THE CELL'S OWN MEMORY. Not "the most-confirmed shop overall",
 * which would preselect a Kingston supermarket for somebody standing in
 * Toronto and attach it to their price if they did not notice -- and a price
 * filed against the wrong shop is worse than a price filed against none,
 * because the spine cannot tell that it is wrong. A first visit to a cell
 * preselects nothing and asks.
 */
export function preselectId(cell, { lastIn = null } = {}) {
  if (typeof cell !== 'string' || cell === '') return null;
  return lastIn ?? null;
}

/* -------------------------------------------------------- the live picker -- */

/**
 * The shop this session is filing prices against.
 *
 * Session memory, not stored: the persistent half is the per-cell record,
 * which is a fact about a place, while this is a fact about right now. A
 * phone reopened tomorrow in the same cell gets the same answer from
 * `chosenFor` anyway, and one that has moved must not inherit yesterday's
 * shop from a variable nobody can see.
 */
let chosen = null;

/** The chosen shop object, or null. */
export function chosenShop() {
  return chosen;
}

// Every scan request carries the shop's name and kind word, so the one Gemini
// call knows what kind of store the user is in (alternatives, item 18). The
// getter is registered here, not imported there, to keep api.js free of a cycle.
api.setScanShopProvider?.(() => chosen);

/** The name to file a price under, or '' -- the shape `recordCorrection` wants. */
export function chosenName() {
  return chosen?.name ?? '';
}

/** The identity to file a price under, or null. D-081: this is not the name. */
export function chosenId() {
  return chosen?.id ?? null;
}

/** Test-only, and the "no shop" row: forgets what this session had selected. */
export function clearChosen() {
  chosen = null;
}

/**
 * Seed the session's shop from the cell the phone is in, if it has been here
 * before. Cheap, synchronous, and safe to call on every pad open: it reads
 * the cached cell and the device's own record, and asks nothing of the OS.
 *
 * Returns the shop now selected, or null.
 */
export function chosenFor() {
  if (chosen) return chosen;
  if (!locationAllowed()) return null;
  const cell = cellNow();
  const id = preselectId(cell, { lastIn: store.lastShopIn(cell) });
  if (!id) return null;
  const remembered = store.knownShops().find((k) => k.id === id);
  if (!remembered) return null;
  chosen = { id: remembered.id, name: remembered.name, hint: remembered.hint };
  return chosen;
}

/**
 * The shopper tapped a shop. Records it against the cell and this session.
 *
 * `null` clears the selection, which is the "no shop" row: a price with no
 * shop is still worth recording (the whole flow works with location off), so
 * there has to be a way back out of a wrong tap that is not turning consent
 * off.
 */
export function chooseShop(shop) {
  if (!shop) {
    chosen = null;
    return null;
  }
  const entry = store.confirmShop(cellNow(), shop);
  chosen = entry ? { id: entry.id, name: entry.name, hint: entry.hint } : null;
  return chosen;
}

/** Whether this device has said location may be used at all. */
export function locationAllowed() {
  try {
    return store.consent().location === true;
  } catch {
    return false;
  }
}

/** The cached coarse cell, or null. Never asks the OS; see `openShortlist`. */
function cellNow() {
  try {
    return locationAllowed() ? (currentCell() ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * The shortlist for where the phone is, fetched.
 *
 * THE ONLY PLACE THE OS IS ASKED FOR A POSITION IN RESPONSE TO A SHOPPER'S
 * TAP. `refreshCell` is called here, and only when there is no fresh reading
 * and consent is already on -- so the OS prompt, if the browser shows one,
 * lands on the screen where the shopper has just asked "which shop am I in",
 * which is the one moment it explains itself.
 *
 * NEVER THROWS AND NEVER BLOCKS THE PRICE. Consent off, a denied permission,
 * a timeout, Overpass being busy and a cell with no mapped shops all come
 * back as an empty list, because the screen's answer to all five is the same:
 * no shortlist, type the price without a shop.
 *
 * @returns {Promise<{cell: string|null, shops: object[]}>}
 */
export async function openShortlist() {
  if (!locationAllowed()) return { cell: null, shops: [] };
  let cell = cellNow();
  if (!cell) {
    try {
      cell = await refreshCell();
    } catch {
      cell = null;
    }
  }
  if (!cell) return { cell: null, shops: [] };

  let nearby = [];
  try {
    const res = await api.stores(cell);
    nearby = Array.isArray(res?.stores) ? res.stores : [];
  } catch {
    nearby = []; // api.stores is soft already; this is the belt to its braces.
  }
  return {
    cell,
    shops: orderShops(nearby, { known: store.knownShops(), lastId: store.lastShopIn(cell) }),
  };
}
