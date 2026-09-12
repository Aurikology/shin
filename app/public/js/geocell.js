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
 * ONE DEGREE OF LONGITUDE IS NOT ONE DEGREE OF LATITUDE'S WIDTH ONCE YOU ARE
 * NORTH OF THE EQUATOR, WHICH EVERY BETA TESTER IS. Ontario sits around 43 to
 * 44 degrees north, where a degree of longitude is roughly 80 km wide against
 * latitude's steady 111 km. A grid that used the same step for both axes would
 * draw cells nearly one and a half kilometres wide east-west for every one
 * kilometre north-south, silently failing the "about one kilometre" promise
 * for exactly the country this beta runs in. The longitude step below is
 * divided by the cosine of the latitude for that reason.
 */

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Snaps a coordinate pair to its cell id, at roughly `kmSize` kilometres per
 * side. Pure and synchronous: nothing here touches the network, storage, or
 * the geolocation API, so it is the one function in this file safe to unit
 * test without stubbing a browser API.
 */
export function cellFor(lat, lon, kmSize = 1) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const latStep = kmSize / KM_PER_DEGREE_LAT;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const lonStep = kmSize / (KM_PER_DEGREE_LAT * cosLat);
  const cellLat = Math.floor(lat / latStep) * latStep;
  const cellLon = Math.floor(lon / lonStep) * lonStep;
  // Fixed precision, not the float's own digits: two coordinates that snap to
  // the same cell must produce the identical string, and a trailing
  // floating-point tail (`43.699999999999996`) would make two equal cells
  // compare unequal the one time it mattered.
  return `${cellLat.toFixed(4)}:${cellLon.toFixed(4)}`;
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
export function refreshCell(kmSize = 1) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cell = cellFor(pos.coords.latitude, pos.coords.longitude, kmSize);
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
