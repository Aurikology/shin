/**
 * Item 11a: a neighbourhood-level cell, about one kilometre, computed on the
 * phone. `cellFor` takes a latitude and longitude in and returns a snapped
 * grid id out, for `/api/stores` and for anywhere a scan's rough
 * neighbourhood is wanted without the exact point.
 *
 * THIS FILE ALSO KEEPS THE EXACT READING NOW, changed 2026-09-14 on the
 * founder's word ("build everything for collecting EVERYTHING") and the
 * vision doc's own sentence that all of a user's scanned data trains Shin's
 * models and answers other shoppers. Until today this header said the exact
 * pair was never kept past the `cellFor` call that snapped it; that was true
 * of this module then and is not true of it now. `currentExact()` hands back
 * the same reading `currentCell()` is built from -- latitude, longitude,
 * accuracy, and when it was taken -- for `api.js` to attach to a scan
 * alongside the cell, gated the same way the cell always was: only ever read
 * with location consent on, and only ever sent to the server, which itself
 * re-checks consent (`locationFor` in server.ts) before writing either one
 * down. Nothing changed about *when* a position is asked for or *whether* a
 * scan needs one; what changed is that this module stops throwing away the
 * two numbers it already has once it has snapped them.
 *
 * `cellFor` is unaffected. It answers "what cell does this snap to" and
 * knows nothing of the exact-reading cache below it; the cell string alone is
 * still what a caller who never asks for `currentExact()` ever sees.
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

let cached = null; // { cell, lat, lon, accuracy, at } | null

/**
 * Asks the OS for a position and caches the cell it snaps to, and now the
 * exact reading alongside it (see the file header, 2026-09-14). Never called
 * automatically and never called without location consent already on: the
 * caller (the consent screen turning the toggle on, app start when consent
 * was already on from a previous launch, or the camera screen on its first
 * render, task item 3) is what gates this, because asking the OS for a
 * position is itself the thing consent is about.
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
        cached = cell
          ? {
              cell,
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
              at: Date.now(),
            }
          : null;
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

/**
 * The exact reading behind the current cell, or `null` on the same staleness
 * rule `currentCell()` uses -- one cache, one freshness check, so the two
 * never disagree about whether a reading is still good. `api.js` reads this
 * to send latitude, longitude, accuracy, and the time of the reading
 * alongside the cell; nothing here decides whether that is allowed, because
 * that decision is consent's, checked before this is ever called and again
 * on the server before either number is written down.
 */
export function currentExact() {
  if (!cached) return null;
  if (Date.now() - cached.at > STALE_MS) return null;
  return { lat: cached.lat, lon: cached.lon, accuracy: cached.accuracy, at: new Date(cached.at).toISOString() };
}

/** Test-only: drops the cached reading so a suite can start clean. */
export function _resetForTests() {
  cached = null;
}
