/**
 * Which shop is this price being written down at, and how the shopper stops
 * being asked.
 *
 * ASKED FOR IN THESE WORDS, 2026-09-13: "can we allow shin to use their
 * location and then assess instead of them having to input the store they're
 * in multiple times. Also Pexi must be able to identify the pattern of where
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
import { BUNDLED_CHAINS } from './chains.js';
import { pt } from './price-strings.js';

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

/**
 * The OpenStreetMap identity of the chosen shop, or null.
 *
 * `chosenId` can now be a chain (`chain:...`) or a typed name (`text:...`),
 * neither of which is OpenStreetMap's. D-081's distinct-seller counting keys on
 * an OSM id, and sending a made-up one would be exactly the collapse that
 * ruling was opened about, so only a real `node/`, `way/` or `relation/` id
 * ever travels as a `storeId`.
 */
export function chosenOsmId() {
  const id = chosen?.id ?? null;
  return typeof id === 'string' && /^(node|way|relation)\//.test(id) ? id : null;
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

/* ------------------------------------------- the list a shopper picks from -- */

/**
 * WHAT THE PICKER SHOWS, and why it no longer waits for anything (D03).
 *
 * The old picker was OpenStreetMap's three nearest places behind a network
 * call that took ten seconds and then timed out, with no search and no Save-On
 * or No Frills in it. And since a price needs a shop (RULINGS "Attribution,
 * provenance and correction data"), an empty picker blocked the whole price
 * path.
 *
 * Now the list is built on the phone, at once, from three sources in this
 * order, and the network is only ever an extra:
 *
 *   1. shops this shopper has used, the LAST-USED one first (then by how often);
 *   2. places nearby, when location is on and the lookup answered in time;
 *   3. the chains Pexi's own price data names (`chains.js`, refreshed from
 *      `/api/store-chains` in the background).
 *
 * A name appears once, whichever source named it first. A search box narrows
 * the list, and a name that matches nothing is offered back as a typed shop, so
 * nobody is ever stopped by the list not knowing their corner store.
 */

/** Case, accents and punctuation folded away, so "Marché Adonis" finds "marche adonis". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '');
}

/** The picker id of a chain: a chain is not a branch and has no OpenStreetMap node. */
export function chainId(name) {
  return `chain:${fold(name)}`;
}

/** The picker id of a name the shopper typed. */
export function textId(name) {
  return `text:${fold(name)}`;
}

let chains = BUNDLED_CHAINS.slice();

/** The chain names in force: the bundled floor until the server's copy arrives. */
export function chainNames() {
  return chains.slice();
}

/** Swaps in a fresher list. Ignores anything that is not a non-empty list of names. */
export function setChains(names) {
  const clean = (Array.isArray(names) ? names : [])
    .map((n) => (typeof n === 'string' ? n : n?.name))
    .filter((n) => typeof n === 'string' && n.trim() !== '')
    .map((n) => n.trim());
  if (clean.length > 0) chains = clean;
}

/**
 * Fetches the server's copy of the chain list in the background. Fire and
 * forget: the picker is already showing the bundled list, and a failure leaves
 * it exactly as it was.
 */
export function refreshChains() {
  try {
    return Promise.resolve(api.storeChains?.())
      .then((res) => setChains(res?.chains))
      .catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

/**
 * The picker's rows. Pure: every input is an argument, so a test drives it with
 * no phone, no network and no storage.
 *
 * @param {object} [opts]
 * @param {string} [opts.query]  what the search box holds.
 * @param {{id:string,name:string,hint?:string,count?:number,at?:string}[]} [opts.known]
 * @param {{id:string,name:string,hint?:string}[]} [opts.nearby]
 * @param {string[]} [opts.names]  chain names.
 * @returns {{id:string,name:string,hint:string,count:number,custom?:boolean}[]}
 */
export function pickerShops({ query = '', known = [], nearby = [], names = chains } = {}) {
  const used = (Array.isArray(known) ? known : []).slice();
  // Last used first, by the time it was last confirmed; the rest by how often.
  const newest = used.slice().sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))[0] ?? null;
  const rest = used
    .filter((k) => k !== newest)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || String(b.at ?? '').localeCompare(String(a.at ?? '')));

  const seenId = new Set();
  const seenName = new Set();
  const out = [];
  const push = (s, count) => {
    if (!s || typeof s.id !== 'string' || typeof s.name !== 'string') return;
    const name = s.name.trim();
    const key = fold(name);
    if (name === '' || key === '' || seenId.has(s.id) || seenName.has(key)) return;
    seenId.add(s.id);
    seenName.add(key);
    out.push({ id: s.id, name, hint: String(s.hint ?? ''), count });
  };

  if (newest) push(newest, newest.count ?? 1);
  for (const k of rest) push(k, k.count ?? 1);
  for (const n of Array.isArray(nearby) ? nearby : []) push(n, 0);
  for (const name of Array.isArray(names) ? names : []) push({ id: chainId(name), name }, 0);

  const q = fold(query);
  if (q === '') return out;
  const hits = out.filter((s) => fold(s.name).includes(q) || fold(s.hint).includes(q));
  const typed = String(query).trim();
  if (!out.some((s) => fold(s.name) === q)) {
    hits.push({ id: textId(typed), name: typed, hint: pt('shop_not_listed'), count: 0, custom: true });
  }
  return hits;
}

/* The places nearby, remembered for the cell they were fetched in. */
let nearbyMemo = { cell: null, shops: [] };

/** Whatever nearby places the last lookup for this cell found, with no network call. */
export function nearbyCached() {
  const cell = cellNow();
  return cell && nearbyMemo.cell === cell ? nearbyMemo.shops : [];
}

/**
 * The nearby places, but never for longer than `ms`. The lookup keeps running
 * after the deadline and fills the cache for next time; the caller just stops
 * waiting. Consent off, no cell, an Overpass outage and a slow answer all come
 * back as an empty list.
 */
export function nearbyWithin(ms = 1500) {
  if (!locationAllowed()) return Promise.resolve([]);
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve([]), ms);
  });
  const lookup = openShortlist()
    .then(({ cell, shops }) => {
      if (cell) nearbyMemo = { cell, shops };
      return shops;
    })
    .catch(() => []);
  return Promise.race([lookup, deadline]).finally(() => clearTimeout(timer));
}

/** The shop this shopper confirmed most recently, or null. The row the pad can offer. */
export function lastUsedShop() {
  const used = store.knownShops().slice();
  used.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return used[0] ?? null;
}
