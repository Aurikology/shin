/**
 * The developer switch (D28, 2026-10-06). The You page's Developer row is a
 * tool for the owner, and it was drawn for every shopper. It now shows only
 * when the screen-tag badge is already on (the person found the switch) or the
 * app was opened with `?dev=1`.
 *
 * `?dev=1` has to survive navigation: the router rewrites the query to
 * `?s=you` on the first tap, so the parameter is remembered on this device the
 * moment it is seen (router.js `start`), and `?dev=0` forgets it. Storage can
 * be blocked or throw, in which case the parameter only counts for the page
 * load that carried it.
 */

const KEY = 'shin.dev';

function readFlag() {
  try { return globalThis.localStorage?.getItem(KEY) === '1'; } catch { return false; }
}

/** Reads `?dev=1` or `?dev=0` off a query string and remembers it. Returns the state now in force. */
export function captureDevParam(search = globalThis.location?.search ?? '') {
  const v = new URLSearchParams(search).get('dev');
  if (v !== '1' && v !== '0') return readFlag();
  try {
    if (v === '1') globalThis.localStorage?.setItem(KEY, '1');
    else globalThis.localStorage?.removeItem(KEY);
  } catch { /* private window: the parameter counts for this load only, via the caller's own check */ }
  return v === '1';
}

/** Whether developer tools show: `?dev=1` was seen (now or earlier), or the developer switch (tag badge) is on. */
export function devOn({ tagsOn = false, search = globalThis.location?.search ?? '' } = {}) {
  return Boolean(tagsOn) || readFlag() || new URLSearchParams(search).get('dev') === '1';
}

/*
 * The pack read (RULINGS.md "A scan never ends with no result", amended
 * 2026-10-10; Jamin: "sending picture to claude is a developer only setting").
 * When neither the catalogue nor Open Food Facts names a barcode, a developer
 * may have the camera frame sent to Claude to read the pack. Off by default and
 * for every shopper: with it off the camera keeps its frames on the phone and a
 * double miss goes to typing the name. The server checks too (a listed device
 * or the admin token), so this switch only decides what the phone offers.
 */
const PACK_READ_KEY = 'shin.dev.packRead';

/** Whether this phone sends a scan's camera frame to be read by Claude. False unless switched on in the Developer row. */
export function packReadOn() {
  try { return globalThis.localStorage?.getItem(PACK_READ_KEY) === '1'; } catch { return false; }
}

/** The Developer row's switch. Storage blocked means it stays off, which is the safe side. */
export function setPackReadOn(value) {
  try {
    if (value) globalThis.localStorage?.setItem(PACK_READ_KEY, '1');
    else globalThis.localStorage?.removeItem(PACK_READ_KEY);
  } catch { /* private window: the switch cannot be remembered, so it stays off */ }
  return packReadOn();
}
