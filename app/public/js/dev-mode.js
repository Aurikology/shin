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
