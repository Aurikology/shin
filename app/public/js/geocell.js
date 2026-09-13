/**
 * Item 11a: a neighbourhood-level cell, about one kilometre, computed on the
 * phone. Never raw coordinates, on this file's own account: `cellFor` takes a
 * latitude and longitude in and returns a snapped grid id out, and nothing in
 * this module keeps, logs, or exposes the input pair once that call returns.
 * `currentCell()` (what everything else in this app is allowed to read) never
 * hands back anything finer than the cell string itself.
 *
 * WHY A GRID AND NOT A ROUNDED COORDINATE. Rounding a coordinate to three
 * decimal places still names a point, just a coarser one, and two phones a
 * few metres apart on either side of a rounding boundary round to two
 * different points that do not obviously neighbour each other. A grid cell is
 * an area: every device standing in roughly the same kilometre gets the exact
 * same id, which is the property item 11b needs (matching the cell against
 * nearby shops) and the property that makes "about a kilometre" a true
 * sentence on the consent screen rather than a rounding artifact being
 * described as a design choice.
 *
 * THE GRID IS THE SERVER'S GRID, AND IT WAS NOT UNTIL 2026-09-13. This file
 * used to draw its own grid: a cosine-corrected kilometre square, written
 * `"43.2537:-79.9208"`, four decimal places and a colon. `app/src/stores.ts`
 * has always read a cell as `"lat,lon"` on a 0.01-degree grid, two decimal
 * places and a comma, and `parseCell` splits on the comma -- so every cell
 * this app has ever sent parsed to `null` on arrival. The correction route
 * dropped it silently (a null cell is the same shape as consent being off, so
 * nothing ever looked wrong) and `/api/stores` would have answered 400 to
 * every request, which is why the store lookup could not be wired up before
 * this was fixed. Proved by hand against both files before changing either.
 *
 * So there is one grid now and the server owns it, for the reason the server's
 * own header gives: it re-snaps whatever it is handed regardless, so a second
 * grid on this side could only ever disagree with the one that decides. The
 * snap here is `Math.round` onto 0.01 degrees and `toFixed(2)`, character for
 * character what `parseCell` does, which makes the client's answer a fixed
 * point of the server's: what is sent is exactly what is stored.
 *
 * THIS IS COARSER THAN WHAT THE FILE USED TO EMIT, deliberately and in that
 * direction only. 0.01 degrees of latitude is 1.11 km, which is the "about a
 * kilometre" the consent screen says out loud. Nothing here may ever be made
 * finer: a shortlist that needs more precision than this is a shortlist with
 * the wrong design, and the fix is a shorter list, not a smaller square.
 *
 * The cost of dropping the cosine correction is that a cell in southern
 * Ontario is about 1.11 km north-south and about 0.81 km east-west rather
 * than square. Both are "about a kilometre", both are coarser than a street,
 * and agreeing with the server is worth more than the aspect ratio.
 */

/** The server's grid, from `app/src/stores.ts`. Never make this smaller. */
const CELL_DEGREES = 0.01;

/**
 * Snaps a coordinate pair to its cell id. Pure and synchronous: nothing here
 * touches the network, storage, or the geolocation API, so it is the one
 * function in this file safe to unit test without stubbing a browser API.
 *
 * Returns the canonical `"lat,lon"` the server stores, or null for anything
 * that is not a pair of finite numbers.
 */
export function cellFor(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cellLat = Math.round(lat / CELL_DEGREES) * CELL_DEGREES;
  const cellLon = Math.round(lon / CELL_DEGREES) * CELL_DEGREES;
  // Fixed precision, not the float's own digits: two coordinates that snap to
  // the same cell must produce the identical string, and a trailing
  // floating-point tail (`43.699999999999996`) would make two equal cells
  // compare unequal the one time it mattered.
  return `${cellLat.toFixed(2)},${cellLon.toFixed(2)}`;
}

/* -------------------------------------------------------- the live reading */

/**
 * How long a reading stays good enough to attach to a scan. Half an hour: a
 * kilometre-wide cell does not go stale by walking across a parking lot, and
 * this is generous enough that most scans in one shopping trip reuse the same
 * reading rather than asking the OS again.
 */
const STALE_MS = 30 * 60 * 1000;

let cached = null; // { cell, at } | null

/**
 * Asks the OS for a position and caches the cell it snaps to. Never called
 * automatically and never called without location consent already on: the
 * caller (the consent screen turning the toggle on, or app start when consent
 * was already on from a previous launch) is what gates this, because asking
 * the OS for a position is itself the thing consent is about.
 *
 * Resolves to the cell on success and to `null` on any failure (permission
 * denied, no `navigator.geolocation`, a timeout) -- never throws, because a
 * scan must never wait on, or break over, a location read that was always
 * secondary to what Shin is being pointed at (priority 1: always answer).
 */
export function refreshCell() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cell = cellFor(pos.coords.latitude, pos.coords.longitude);
        cached = cell ? { cell, at: Date.now() } : null;
        resolve(cell);
      },
      () => resolve(null),
      { maximumAge: STALE_MS, timeout: 5000 },
    );
  });
}

/**
 * The cell to attach to a scan right now, or `null` if there is none fresh
 * enough. Synchronous on purpose: a scan's identify call reads this once,
 * inline, rather than awaiting a fresh OS read on every single scan, which is
 * both slower and a location prompt firing far more often than the consent
 * screen's own description of "a rough area" would suggest.
 */
export function currentCell() {
  if (!cached) return null;
  if (Date.now() - cached.at > STALE_MS) return null;
  return cached.cell;
}

/** Test-only: drops the cached reading so a suite can start clean. */
export function _resetForTests() {
  cached = null;
}
